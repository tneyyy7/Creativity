import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  Loader2, Link2, Globe, Users as UsersIcon, ChevronDown, ChevronRight,
  Copy, Check, RefreshCw, TrendingUp, Plus, Trash2, X, Shuffle, Gem
} from 'lucide-react'
import {
  adminReferralStats, adminReferralUsers,
  adminCreateReferralCode, adminDeleteReferralCode
} from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { getNicknameStyle } from '../../lib/nicknameStyle'

// База для генерации кастомных ссылок друзьям (?ref=код). Берём прод-домен из
// env, чтобы ссылки не указывали на localhost при разработке.
const APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || 'https://thecreativityapp.com').replace(/\/+$/, '')
const linkFor = (code) => `${APP_URL}/?ref=${encodeURIComponent(code)}`

// Предпросмотр нормализации кода (совпадает с серверной: a-z0-9_-, lower, 64).
const normalizeCode = (raw) =>
  String(raw || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64)

export function Referrals({ onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    const res = await adminReferralStats()
    if (!res) setError(true)
    else setStats(res)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US') } catch { return '—' }
  }

  const deleteCode = async (code) => {
    if (!window.confirm(t('admin_ref_confirm_delete'))) return
    const res = await adminDeleteReferralCode(code)
    if (res.ok) load()
    else alert(res.error || t('admin_ref_load_error'))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
  }
  if (error || !stats) {
    return <div className="py-16 text-center text-sm text-red-400">{t('admin_ref_load_error')}</div>
  }

  const attributedPct = stats.total_users > 0
    ? Math.round((stats.total_attributed / stats.total_users) * 100)
    : 0

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={Link2} label={t('admin_ref_codes')} value={stats.codes.length} accent="text-purple-400" />
        <StatCard icon={UsersIcon} label={t('admin_ref_attributed')} value={stats.total_attributed} accent="text-emerald-400" />
        <StatCard icon={TrendingUp} label={t('admin_ref_share')} value={`${attributedPct}%`} accent="text-amber-400" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-purple-400" /> {t('admin_ref_by_code')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title={t('admin_ref_refresh')}
            className="p-2 rounded-xl text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white bg-primary/25 hover:bg-primary/35 border border-primary/40 transition-all"
          >
            <Plus className="w-4 h-4" /> {t('admin_ref_new')}
          </button>
        </div>
      </div>

      {/* Codes breakdown */}
      <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
        {stats.codes.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <Link2 className="w-8 h-8 text-gray-600" />
            {t('admin_ref_empty')}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {stats.codes.map(c => (
              <CodeRow
                key={c.code}
                code={c}
                expanded={expanded === c.code}
                onToggle={() => setExpanded(expanded === c.code ? null : c.code)}
                onDelete={() => deleteCode(c.code)}
                fmtDate={fmtDate}
                onViewProfile={onViewProfile}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hosts breakdown */}
      {stats.hosts.length > 0 && (
        <>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" /> {t('admin_ref_by_host')}
          </h3>
          <div className="bg-[#15141d]/70 backdrop-blur-xl border border-white/10 rounded-3xl divide-y divide-white/5">
            {stats.hosts.map(h => (
              <div key={h.host} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-300 truncate flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-gray-500 shrink-0" /> {h.host}
                </span>
                <span className="text-sm font-black text-white">{h.count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {creating && (
        <CreateCodeModal
          existing={stats.codes.map(c => c.code)}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load() }}
          t={t}
        />
      )}
    </div>
  )
}

function CreateCodeModal({ existing, onClose, onCreated, t }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const normalized = normalizeCode(code)
  const duplicate = normalized && existing.includes(normalized)

  const randomize = () => setCode(Math.random().toString(36).slice(2, 10))

  const submit = async () => {
    setErr('')
    setBusy(true)
    const res = await adminCreateReferralCode({ code: normalized, label })
    setBusy(false)
    if (res.ok) onCreated()
    else if (res.reason === 'exists') setErr(t('admin_ref_exists'))
    else setErr(res.error || t('admin_ref_load_error'))
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#15141d]/75 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 p-6 space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-black text-white flex items-center gap-2 pr-8">
          <Plus className="w-5 h-5 text-purple-400" /> {t('admin_ref_new')}
        </h2>

        {/* Code input */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider font-bold text-gray-500">{t('admin_ref_code')}</label>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('admin_ref_code_placeholder')}
              autoFocus
              className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
            />
            <button
              onClick={randomize}
              title={t('admin_ref_random')}
              className="p-2.5 rounded-xl text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
          {normalized && (
            <p className="text-[11px] text-gray-500 font-mono break-all">{linkFor(normalized)}</p>
          )}
          {duplicate && <p className="text-[11px] text-amber-400">{t('admin_ref_exists')}</p>}
          <p className="text-[11px] text-gray-600">{t('admin_ref_code_hint')}</p>
        </div>

        {/* Label input */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider font-bold text-gray-500">{t('admin_ref_label')}</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('admin_ref_label_placeholder')}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            {t('admin_ref_cancel')}
          </button>
          <button
            onClick={submit}
            disabled={busy || duplicate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-primary/25 hover:bg-primary/35 border border-primary/40 transition-all disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('admin_ref_create')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function CodeRow({ code: c, expanded, onToggle, onDelete, fmtDate, onViewProfile, t }) {
  const [copied, setCopied] = useState(false)
  const [users, setUsers] = useState(null)
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (expanded && !users) {
      setLoadingUsers(true)
      adminReferralUsers({ code: c.code }).then(res => {
        setUsers(res?.users || [])
        setLoadingUsers(false)
      })
    }
  }, [expanded, users, c.code])

  const copyLink = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(linkFor(c.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-white truncate flex items-center gap-2">
            {c.label || c.code}
            {c.label && <span className="text-[11px] font-mono text-gray-500 truncate">{c.code}</span>}
          </span>
          <span className="text-[11px] text-gray-500">
            {c.count > 0
              ? `${t('admin_ref_last_signup')}: ${fmtDate(c.last_signup)}`
              : t('admin_ref_no_signups')}
          </span>
        </div>
        <span
          onClick={copyLink}
          title={t('admin_ref_copy_link')}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </span>
        {c.registered && (
          <span
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('admin_ref_delete')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </span>
        )}
        {c.last_30d > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 shrink-0">
            +{c.last_30d} / 30d
          </span>
        )}
        <span className="text-base font-black text-white w-10 text-right shrink-0">{c.count}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-11">
          {loadingUsers ? (
            <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('admin_ref_loading_users')}
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => onViewProfile?.(u.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-left"
                >
                  <ProfileAvatar
                    avatarUrl={u.avatar_url}
                    size="sm"
                    isPro={u.is_pro}
                    avatarFrame={u.avatar_frame}
                    workCount={u.finished_work_count}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold text-white truncate block notranslate"
                        translate="no"
                        style={getNicknameStyle(u.nickname_color, '#fff')}
                      >
                        {u.nickname || 'Unknown'}
                      </span>
                      {u.is_pro && (
                        <span className="pro-badge shrink-0">
                          <Gem className="pro-badge-icon" />
                          <span className="pro-badge-text">Pro</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 truncate block">{u.email || '—'}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{fmtDate(u.created_at)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-3 text-xs text-gray-500">{t('admin_ref_no_signups')}</div>
          )}
        </div>
      )}
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
