import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Безопасные операции со Stripe из админки. Секретный ключ Stripe НИКОГДА не
// должен попадать в браузер, поэтому отмена подписки и рефанд живут здесь, в
// edge-функции с service-role ключом. Источник истины — Stripe; статус в БД
// обновит вебхук (customer.subscription.updated/deleted), поэтому здесь БД
// напрямую не трогаем (кроме аудит-лога) — иначе вебхук всё равно перетрёт.
//
// Действия (body.action):
//   'cancel'        — отмена в конце периода (cancel_at_period_end=true)
//   'cancel_now'    — немедленная отмена подписки
//   'refund'        — рефанд последнего платежа по подписке
//
// Деплой: supabase functions deploy admin_cancel_subscription

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

// Тонкая обёртка над Stripe REST API (form-urlencoded), по образцу
// create_stripe_checkout — без SDK, чтобы не тянуть зависимость.
async function stripe(path: string, params: Record<string, string> = {}, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${path} failed`)
  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Service not configured' }, 500)
    if (!STRIPE_SECRET_KEY) return json({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)

    // 1. Кто вызывает — по JWT через anon-клиент.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json({ error: 'Invalid session' }, 401)

    // 2. Проверяем роль — биллинг доступен от admin.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('admin_role, is_admin')
      .eq('id', caller.id)
      .single()

    const role = callerProfile?.admin_role
    const isAdmin =
      role === 'admin' || role === 'superadmin' ||
      (callerProfile?.is_admin === true && !role)
    if (!isAdmin) return json({ error: 'Only admin can manage billing' }, 403)

    // 3. Параметры.
    const { subscriptionId, action } = await req.json().catch(() => ({}))
    if (!subscriptionId) return json({ error: 'Missing subscriptionId' }, 400)
    if (!['cancel', 'cancel_now', 'refund'].includes(action)) {
      return json({ error: 'Invalid action' }, 400)
    }

    // 4. Находим строку подписки и её Stripe id. Ручные (source='manual')
    //    подписки Stripe не касаются — для них есть admin_revoke_pro.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('user_id, source, stripe_subscription_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle()

    if (!sub) return json({ error: 'Subscription not found' }, 404)
    if (sub.source === 'manual') {
      return json({ error: 'Manual subscription — use revoke Pro instead' }, 400)
    }

    // 5. Выполняем операцию в Stripe. Idempotency-Key защищает от двойного клика.
    let result: Record<string, unknown> = {}
    if (action === 'cancel') {
      result = await stripe(`subscriptions/${subscriptionId}`, { cancel_at_period_end: 'true' })
    } else if (action === 'cancel_now') {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      })
      result = await res.json()
      if (!res.ok) throw new Error((result as any).error?.message || 'Stripe cancel failed')
    } else if (action === 'refund') {
      // Рефанд последнего успешного платежа по подписке.
      const subData: any = await stripe(`subscriptions/${subscriptionId}`, {})
      const invoiceId = subData.latest_invoice
      if (!invoiceId) throw new Error('No invoice to refund')
      const invRes = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      })
      const invoice = await invRes.json()
      if (!invRes.ok) throw new Error(invoice.error?.message || 'Invoice fetch failed')
      const chargeId = invoice.charge
      if (!chargeId) throw new Error('No charge to refund')
      result = await stripe('refunds', { charge: String(chargeId) }, `refund_${chargeId}`)
    }

    // 6. Аудит-лог (service-role обходит RLS). Статус в БД не меняем —
    //    его обновит вебхук, чтобы не разойтись со Stripe.
    await admin.from('admin_actions').insert({
      admin_id: caller.id,
      action: `subscription_${action}`,
      target_type: 'subscription',
      target_id: subscriptionId,
      meta: { user_id: sub.user_id },
    })

    return json({ ok: true, result })
  } catch (error) {
    console.error('admin_cancel_subscription error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
