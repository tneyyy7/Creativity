import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  X, Loader2, Ban, ShieldCheck, Crown, Trash2, ExternalLink,
  Mail, Calendar, Clock, FileImage, Flag, Star, ShieldOff, Link2, Globe
} from 'lucide-react'
import {
  adminGetUserDetails, setUserBanned, logAdminAction,
  adminSetRole, adminGrantPro, adminRevokePro, adminDeleteAccount
} from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'

const ROLE_RANK = { moderator: 1, admin: 2, superadmin: 3 }
const ROLE_OPTIONS = ['', 'moderator', 'admin', 'superadmin']

export function UserCard({ userId, adminRole, onClose, onViewProfile, onChanged }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const isSuperadmin = adminRole === 'superadmin'

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminGetUserDetails(userId)
    if (!res) setError(t('admin_users_load_error'))
    setData(res)
    setLoading(false)
  }, [userId, t])

  useEffect(() => { load() }, [load])

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US') } catch { return '—' }
  }

  const p = data?.profile

  const refresh = async () => { await load(); onChanged?.() }

  const toggleBan = async () => {
    setBusy('ban')
    const next = !p.is_banned
    const ok = await setUserBanned(userId, next)
    if (ok) await logAdminAction(next ? 'ban_user' : 'unban_user', 'user', userId)
    setBusy(null)
    if (ok) refresh()
  }

  const grantPro = async () => {
    setBusy('pro')
    const res = await adminGrantPro(userId, 1)
    setBusy(null)
    if (res.ok) refresh()
    else setError(res.error)
  }

  const revokePro = async () => {
    if (!window.confirm(t('admin_users_confirm_revoke_pro'))) return
    setBusy('pro')
    const res = await adminRevokePro(userId)
    setBusy(null)
    if (res.ok) refresh()
    else if (res.reason === 'stripe_managed') setError(t('admin_users_pro_stripe_managed'))
    else setError(res.error || t('admin_users_load_error'))
  }

  const changeRole = async (role) => {
    if (role === (p.admin_role || '')) return
    if (!window.confirm(t('admin_users_confirm_role'))) return
    setBusy('role')
    const res = await adminSetRole(userId, role)
    setBusy(null)
    if (res.ok) refresh()
    else setError(res.error)
  }

  const deleteAccount = async () => {
    if (!window.confirm(t('admin_users_confirm_delete'))) return
    if (!window.confirm(t('admin_users_confirm_delete_2'))) return
    setBusy('delete')
    const res = await adminDeleteAccount(userId)
    setBusy(null)
    if (res.ok) { onChanged?.(); onClose() }
    else setError(res.error)
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar bg-[#15141d] border border-white/10 rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin text-purple-500" />
          </div>
        ) : !p ? (
          <div className="py-24 text-center text-sm text-gray-500">{error || t('admin_users_load_error')}</div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4 pr-8">
              <ProfileAvatar avatarUrl={p.avatar_url} workCount={p.finished_work_count} size="lg" isPro={p.is_pro} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white truncate">{p.nickname || 'Unknown'}</h2>
                  {p.is_pro && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {p.is_banned && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400">{t('admin_banned')}</span>
                  )}
                  {p.admin_role && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/15 text-purple-300">{p.admin_role}</span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
            )}

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Meta icon={Mail} label={t('admin_users_email')} value={p.email || '—'} />
              <Meta icon={Calendar} label={t('admin_users_joined')} value={fmtDate(p.created_at)} />
              <Meta icon={Clock} label={t('admin_users_last_seen')} value={fmtDate(p.last_sign_in_at || p.last_seen)} />
              <Meta icon={Star} label={t('admin_users_pro_status')} value={p.is_pro ? `${p.sub_plan || 'pro'} (${p.sub_source || 'stripe'})` : t('admin_users_free')} />
              <Meta icon={Link2} label={t('admin_ref_code')} value={p.referral_code || '—'} />
              <Meta icon={Globe} label={t('admin_ref_host')} value={p.referrer_host || '—'} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={FileImage} value={data.posts_count} label={t('admin_users_posts')} />
              <Stat icon={Flag} value={data.reports_against} label={t('admin_users_reports_against')} accent={data.reports_against > 0} />
              <Stat icon={Flag} value={data.reports_made} label={t('admin_users_reports_made')} />
            </div>

            {/* Recent posts */}
            {data.recent_posts?.length > 0 && (
              <div className="grid grid-cols-6 gap-1.5">
                {data.recent_posts.map(post => (
                  <div key={post.id} className="aspect-square rounded-lg overflow-hidden bg-white/5">
                    {post.image_url && (
                      <img src={post.image_url} alt="" className={`w-full h-full object-cover ${post.is_nsfw ? 'blur-sm' : ''}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleBan}
                  disabled={!!busy}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    p.is_banned
                      ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  }`}
                >
                  {busy === 'ban' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                  {p.is_banned ? t('admin_users_unban') : t('admin_users_ban')}
                </button>

                {p.is_pro && p.sub_source === 'manual' ? (
                  <button
                    onClick={revokePro}
                    disabled={!!busy}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all disabled:opacity-40"
                  >
                    {busy === 'pro' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    {t('admin_users_revoke_pro')}
                  </button>
                ) : (
                  <button
                    onClick={grantPro}
                    disabled={!!busy || (p.is_pro && p.sub_source === 'stripe')}
                    title={p.is_pro && p.sub_source === 'stripe' ? t('admin_users_pro_stripe_managed') : ''}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all disabled:opacity-40"
                  >
                    {busy === 'pro' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
                    {t('admin_users_grant_pro')}
                  </button>
                )}
              </div>

              <button
                onClick={() => { onViewProfile?.(userId); onClose() }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('admin_users_view_profile')}
              </button>

              {/* Role management — superadmin only */}
              {isSuperadmin && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                  <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 ml-1" />
                  <span className="text-xs text-gray-400">{t('admin_users_role')}</span>
                  <select
                    value={p.admin_role || ''}
                    disabled={busy === 'role'}
                    onChange={(e) => changeRole(e.target.value)}
                    className="ml-auto bg-[#1a1924] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r || 'none'} value={r}>{r || t('admin_users_role_none')}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Delete — superadmin only */}
              {isSuperadmin && (
                <button
                  onClick={deleteAccount}
                  disabled={!!busy}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-500/20 transition-all disabled:opacity-40"
                >
                  {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {t('admin_users_delete')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
      <div className="flex items-center gap-1.5 text-gray-500">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <p className="text-white font-medium mt-1 truncate">{value}</p>
    </div>
  )
}

function Stat({ icon: Icon, value, label, accent = false }) {
  return (
    <div className={`p-3 rounded-xl text-center ${accent ? 'bg-red-500/10' : 'bg-white/[0.03]'} border border-white/5`}>
      <Icon className={`w-4 h-4 mx-auto ${accent ? 'text-red-400' : 'text-gray-500'}`} />
      <p className={`text-lg font-black mt-1 ${accent ? 'text-red-400' : 'text-white'}`}>{value ?? 0}</p>
      <p className="text-[10px] text-gray-500 leading-tight">{label}</p>
    </div>
  )
}
