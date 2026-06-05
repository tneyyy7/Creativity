import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Жёсткое удаление аккаунта. Удаление строки profiles НЕ удаляет запись в
// auth.users — это делается только через auth.admin.deleteUser с service-role
// ключом, который НИКОГДА не должен попадать в браузер. Поэтому операция живёт
// здесь, в edge-функции. Каскад (posts/likes/comments/...) обеспечивается
// внешними ключами ON DELETE CASCADE на auth.users(id).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: 'Service not configured' }, 500)
    }

    // 1. Кто вызывает — определяем по их JWT через anon-клиент.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) return json({ error: 'Invalid session' }, 401)

    // 2. Проверяем, что вызывающий — superadmin (удаление аккаунта необратимо).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('admin_role, is_admin')
      .eq('id', caller.id)
      .single()

    const isSuperadmin =
      callerProfile?.admin_role === 'superadmin' ||
      (callerProfile?.is_admin === true && !callerProfile?.admin_role)
    if (!isSuperadmin) return json({ error: 'Only superadmin can delete accounts' }, 403)

    // 3. Цель.
    const { userId } = await req.json().catch(() => ({}))
    if (!userId) return json({ error: 'Missing userId' }, 400)
    if (userId === caller.id) return json({ error: 'Cannot delete your own account' }, 400)

    const { data: targetProfile } = await admin
      .from('profiles')
      .select('admin_role, is_admin, nickname')
      .eq('id', userId)
      .single()

    // Нельзя снести другого superadmin без понижения — защита от потери доступа.
    const targetIsSuper =
      targetProfile?.admin_role === 'superadmin' ||
      (targetProfile?.is_admin === true && !targetProfile?.admin_role)
    if (targetIsSuper) return json({ error: 'Demote the superadmin before deleting' }, 400)

    // 4. Удаляем из auth (каскад снесёт связанные строки).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) {
      console.error('deleteUser error:', delErr)
      return json({ error: delErr.message }, 400)
    }

    // 5. Аудит-лог (service-role обходит RLS, пишем напрямую).
    await admin.from('admin_actions').insert({
      admin_id: caller.id,
      action: 'delete_account',
      target_type: 'user',
      target_id: userId,
      meta: { nickname: targetProfile?.nickname ?? null },
    })

    return json({ ok: true })
  } catch (error) {
    console.error('admin_delete_user error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
