import { supabase } from './core'

// Этап 5: подписки и биллинг. Чтение идёт через SECURITY DEFINER RPC
// (проверка роли в БД), операции со Stripe — через edge-функцию с service-role
// ключом. Секрет Stripe в браузер не попадает. Источник истины — Stripe; БД
// отражает вебхуки и может отставать.

// Цены тарифов (в $/мес для MRR). В БД цен нет — держим их здесь, рядом с
// расчётом MRR, чтобы легко править. Должны совпадать с Subscription.jsx.
export const PLAN_MRR = {
  pro_monthly: 4.99,
  pro_yearly: 39.99 / 12, // годовой тариф нормализуем к месяцу
}

// Считает примерный MRR из агрегатов admin_subscription_stats.
export function computeMrr(stats) {
  if (!stats) return 0
  const monthly = (stats.active_monthly || 0) * PLAN_MRR.pro_monthly
  const yearly = (stats.active_yearly || 0) * PLAN_MRR.pro_yearly
  return monthly + yearly
}

// Список подписок с серверной пагинацией/фильтром. Возвращает { total, items } или null.
export async function adminListSubscriptions({ search = '', status = 'all', limit = 25, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('admin_list_subscriptions', {
      p_search: search || null,
      p_status: status || 'all',
      p_limit: limit,
      p_offset: offset,
    })
    if (error) throw error
    return data || { total: 0, items: [] }
  } catch (e) {
    console.error('adminListSubscriptions error:', e)
    return null
  }
}

// Агрегаты для карточек дашборда подписок. Возвращает объект или null.
export async function adminSubscriptionStats() {
  try {
    const { data, error } = await supabase.rpc('admin_subscription_stats')
    if (error) throw error
    return data || {}
  } catch (e) {
    console.error('adminSubscriptionStats error:', e)
    return null
  }
}

// Операции со Stripe через edge-функцию. action: 'cancel' | 'cancel_now' | 'refund'.
// Возвращает { ok, error? }.
export async function adminStripeAction(subscriptionId, action) {
  try {
    const { data, error } = await supabase.functions.invoke('admin_cancel_subscription', {
      body: { subscriptionId, action },
    })
    if (error) {
      let msg = error.message
      try { msg = (await error.context?.json())?.error || msg } catch { /* ignore */ }
      return { ok: false, error: msg }
    }
    return data?.ok ? { ok: true } : { ok: false, error: data?.error || 'unknown' }
  } catch (e) {
    console.error('adminStripeAction error:', e)
    return { ok: false, error: e.message }
  }
}
