import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  Search, Loader2, ChevronLeft, ChevronRight, CreditCard, ExternalLink,
  Star, Ban, RotateCcw, XCircle, DollarSign, Users as UsersIcon, Hand,
  X, User, Calendar, Clock, Hash, AlertTriangle
} from 'lucide-react'
import {
  adminListSubscriptions, adminSubscriptionStats, adminStripeAction, computeMrr
} from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { getNicknameStyle } from '../../lib/nicknameStyle'
import { AnimatedPillGroup } from '../../components/AnimatedPillGroup'

const PAGE_SIZE = 25

// Открыть подписку напрямую в Stripe Dashboard (живой режим).
const stripeUrl = (id) => `https://dashboard.stripe.com/subscriptions/${id}`

const STATUS_STYLES = {
  active: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-amber-500/15 text-amber-400',
  expired: 'bg-gray-500/15 text-gray-400',
  inactive: 'bg-gray-500/15 text-gray-500',
}

export function Subscriptions({ onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ total: 0, items: [] })
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)

  const load = useCallback(async (searchValue, statusValue, pageValue) => {
    setLoading(true)
    setError(false)
    const res = await adminListSubscriptions({
      search: searchValue, status: statusValue,
      limit: PAGE_SIZE, offset: pageValue * PAGE_SIZE,
    })
    if (!res) setError(true)
    else setData(res)
    setLoading(false)
  }, [])

  useEffect(() => { load(search, status, page) }, [page, status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { adminSubscriptionStats().then(setStats) }, [])

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(0); load(value, status, 0) }, 350)
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US') } catch { return '—' }
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  const doStripeAction = async (sub, action) => {
    const confirms = {
      cancel: t('admin_sub_confirm_cancel'),
      cancel_now: t('admin_sub_confirm_cancel_now'),
      refund: t('admin_sub_confirm_refund'),
    }
    if (!window.confirm(confirms[action])) return
    setBusyId(sub.id)
    const res = await adminStripeAction(sub.stripe_subscription_id, action)
    setBusyId(null)
    if (res.ok) {
      // Источник истины — Stripe; статус обновит вебхук. Перезагружаем список.
      load(search, status, page)
      adminSubscriptionStats().then(setStats)
    } else {
      alert(res.error || t('admin_sub_action_error'))
    }
  }

  // Подписки, у которых source='stripe', но нет stripe_subscription_id (legacy /
  // ручные выдачи), нельзя трогать через Stripe API — кнопки скрываем.
  const canManageStripe = (s) => s.source !== 'manual' && !!s.stripe_subscription_id

  const mrr = computeMrr(stats)

  const STATUS_FILTERS = ['all', 'active', 'cancelled', 'expired', 'inactive']

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label={t('admin_sub_mrr')} value={`$${mrr.toFixed(2)}`} accent="text-emerald-400" />
        <StatCard icon={Star} label={t('admin_sub_active_pro')} value={stats?.active_pro ?? '—'} accent="text-amber-400" />
        <StatCard icon={UsersIcon} label={t('admin_sub_total')} value={stats?.total ?? '—'} accent="text-purple-400" />
        <StatCard icon={Hand} label={t('admin_sub_manual')} value={stats?.manual ?? '—'} accent="text-sky-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('admin_sub_search')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        <AnimatedPillGroup
          value={status}
          onChange={(v) => { setPage(0); setStatus(v) }}
          options={STATUS_FILTERS.map(v => ({ value: v, label: t(`admin_sub_status_${v}`) }))}
          containerClassName="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/5 rounded-xl overflow-x-auto"
          buttonClassName="lg-pill px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
          pillVariant="glass"
        />
        <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
          {data.total} {t('admin_content_total')}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-400">{t('admin_sub_load_error')}</div>
        ) : data.items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <CreditCard className="w-8 h-8 text-gray-600" />
            {t('admin_sub_empty')}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header (desktop) */}
            <div className="hidden md:grid grid-cols-[1.4fr_auto_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <span>{t('admin_users_user')}</span>
              <span>{t('admin_sub_plan')}</span>
              <span className="text-right">{t('admin_sub_renews')}</span>
              <span className="text-center">{t('admin_users_status')}</span>
              <span className="text-right pr-1">{t('admin_tags_actions')}</span>
            </div>
            {data.items.map(s => {
              const isManual = s.source === 'manual'
              const canStripe = canManageStripe(s)
              const busy = busyId === s.id
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto] md:grid-cols-[1.4fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3"
                >
                  {/* User → open subscription detail panel */}
                  <button
                    onClick={() => setSelected(s)}
                    className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
                  >
                    <ProfileAvatar
                      avatarUrl={s.user_avatar}
                      size="sm"
                      isPro={s.is_pro}
                      avatarFrame={s.user_avatar_frame}
                      workCount={s.user_finished_work_count}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-sm font-bold text-white truncate notranslate"
                          translate="no"
                          style={getNicknameStyle(s.user_nickname_color, '#fff')}
                        >
                          {s.user_nickname || 'Unknown'}
                        </span>
                        {s.is_pro && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                      </div>
                      <span className="text-xs text-gray-500 truncate block">{s.user_email || '—'}</span>
                    </div>
                  </button>

                  {/* Plan + source (desktop) */}
                  <div className="hidden md:flex flex-col items-start gap-0.5">
                    <span className="text-xs font-bold text-gray-300">
                      {s.plan === 'pro_yearly' ? t('admin_sub_yearly') : s.plan === 'pro_monthly' ? t('admin_sub_monthly') : (s.plan || '—')}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isManual ? 'bg-sky-500/15 text-sky-300' : 'bg-purple-500/15 text-purple-300'}`}>
                      {isManual ? t('admin_sub_source_manual') : t('admin_sub_source_stripe')}
                    </span>
                  </div>

                  {/* Period end (desktop) */}
                  <span className="hidden md:block text-xs text-gray-500 text-right whitespace-nowrap">{fmtDate(s.current_period_end)}</span>

                  {/* Status */}
                  <div className="flex md:justify-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[s.status] || 'bg-gray-500/15 text-gray-400'}`}>
                      {t(`admin_sub_status_${s.status}`, s.status)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-1.5 flex-wrap">
                    {canStripe ? (
                      <>
                        <a
                          href={stripeUrl(s.stripe_subscription_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('admin_sub_open_stripe')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {s.status === 'active' && (
                          <button
                            onClick={() => doStripeAction(s, 'cancel')}
                            disabled={busy}
                            title={t('admin_sub_cancel')}
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={() => doStripeAction(s, 'refund')}
                          disabled={busy}
                          title={t('admin_sub_refund')}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-40"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-gray-600 italic">{isManual ? t('admin_sub_manual_hint') : '—'}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> {t('admin_users_prev')}
          </button>
          <span className="text-xs text-gray-500 font-bold">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => (p + 1 < totalPages ? p + 1 : p))} disabled={page + 1 >= totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all disabled:opacity-30">
            {t('admin_users_next')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selected && (
        <SubscriptionDetail
          sub={selected}
          busy={busyId === selected.id}
          canManageStripe={canManageStripe(selected)}
          fmtDate={fmtDate}
          stripeUrl={stripeUrl}
          onAction={(action) => doStripeAction(selected, action)}
          onViewProfile={() => { const id = selected.user_id; setSelected(null); onViewProfile?.(id) }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function SubscriptionDetail({ sub: s, busy, canManageStripe, fmtDate, stripeUrl, onAction, onViewProfile, onClose }) {
  const { t } = useTranslation()
  const isManual = s.source === 'manual'
  const planLabel = s.plan === 'pro_yearly' ? t('admin_sub_yearly') : s.plan === 'pro_monthly' ? t('admin_sub_monthly') : (s.plan || '—')
  // source='stripe' без stripe id — legacy/ручная выдача, через Stripe не управляется.
  const orphanStripe = !isManual && !s.stripe_subscription_id

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[88vh] overflow-y-auto custom-scrollbar bg-[#15141d]/75 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6 space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pr-8">
          <ProfileAvatar
            avatarUrl={s.user_avatar}
            size="lg"
            isPro={s.is_pro}
            avatarFrame={s.user_avatar_frame}
            workCount={s.user_finished_work_count}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2
                className="text-lg font-black text-white truncate notranslate"
                translate="no"
                style={getNicknameStyle(s.user_nickname_color, '#fff')}
              >
                {s.user_nickname || 'Unknown'}
              </h2>
              {s.is_pro && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
            </div>
            <span className="text-xs text-gray-500 truncate block">{s.user_email || '—'}</span>
          </div>
        </div>

        {/* Status + source + plan */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_STYLES[s.status] || 'bg-gray-500/15 text-gray-400'}`}>
            {t(`admin_sub_status_${s.status}`, s.status)}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${isManual ? 'bg-sky-500/15 text-sky-300' : 'bg-purple-500/15 text-purple-300'}`}>
            {isManual ? t('admin_sub_source_manual') : t('admin_sub_source_stripe')}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/5 text-gray-300">{planLabel}</span>
        </div>

        {/* Details */}
        <div className="space-y-2.5">
          <DetailRow icon={Calendar} label={t('admin_sub_period_start')} value={fmtDate(s.current_period_start)} />
          <DetailRow icon={Clock} label={t('admin_sub_renews')} value={fmtDate(s.current_period_end)} />
          <DetailRow icon={Calendar} label={t('admin_sub_created')} value={fmtDate(s.created_at)} />
          <DetailRow icon={Hash} label={t('admin_sub_stripe_sub_id')} value={s.stripe_subscription_id || '—'} mono />
          <DetailRow icon={Hash} label={t('admin_sub_stripe_cust_id')} value={s.stripe_customer_id || '—'} mono />
        </div>

        {/* Orphan stripe warning */}
        {orphanStripe && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed">{t('admin_sub_no_stripe_link')}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          {canManageStripe && (
            <>
              <a
                href={stripeUrl(s.stripe_subscription_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
              >
                <ExternalLink className="w-4 h-4" /> {t('admin_sub_open_stripe')}
              </a>
              {s.status === 'active' && (
                <button
                  onClick={() => onAction('cancel')}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-all disabled:opacity-40"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} {t('admin_sub_cancel')}
                </button>
              )}
              <button
                onClick={() => onAction('refund')}
                disabled={busy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-all disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} {t('admin_sub_refund')}
              </button>
            </>
          )}
          <button
            onClick={onViewProfile}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            <User className="w-4 h-4" /> {t('admin_sub_view_profile')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function DetailRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <span className={`text-xs font-bold text-gray-200 truncate text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black text-white leading-tight truncate">{value}</p>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
}
