import { useState, useEffect, useCallback } from 'react'
import { Shield, Flag, Loader2, Trash2, Ban, Check, X, ExternalLink, Image as ImageIcon, User, MessageSquare, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import {
  fetchReports, updateReportStatus, adminDeletePainting, adminDeleteComment, setUserBanned
} from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'

const STATUS_TABS = ['pending', 'reviewed', 'dismissed', 'all']
const REASON_KEY = {
  spam: 'reason_spam', inappropriate: 'reason_inappropriate', harassment: 'reason_harassment',
  nsfw: 'reason_nsfw', copyright: 'reason_copyright', other: 'reason_other',
}

export function Admin({ onOpenPost, onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState('pending')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchReports(status)
    setReports(data)
    setLoading(false)
  }, [status])

  useEffect(() => { load() }, [load])

  const relTime = (d) => {
    try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: i18n.language === 'ru' ? ru : enUS }) }
    catch { return '' }
  }

  // Drop a report from the local list (after resolving) or refresh it in place.
  const removeLocal = (id) => setReports(prev => prev.filter(r => r.id !== id))
  const patchLocal = (id, patch) => setReports(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))

  const resolve = async (report, newStatus) => {
    setBusyId(report.id)
    const ok = await updateReportStatus(report.id, newStatus)
    setBusyId(null)
    if (!ok) return
    // If we're viewing a single status bucket, the row leaves the list.
    if (status !== 'all') removeLocal(report.id)
    else patchLocal(report.id, { status: newStatus })
  }

  const deletePost = async (report) => {
    if (!window.confirm(t('admin_confirm_delete_post'))) return
    setBusyId(report.id)
    const ok = await adminDeletePainting(report.target_id)
    if (ok) await updateReportStatus(report.id, 'reviewed')
    setBusyId(null)
    if (ok && status !== 'all') removeLocal(report.id)
    else if (ok) patchLocal(report.id, { status: 'reviewed', target: null })
  }

  const deleteComment = async (report) => {
    if (!window.confirm(t('admin_confirm_delete_comment'))) return
    setBusyId(report.id)
    const ok = await adminDeleteComment(report.target_id)
    if (ok) await updateReportStatus(report.id, 'reviewed')
    setBusyId(null)
    if (ok && status !== 'all') removeLocal(report.id)
    else if (ok) patchLocal(report.id, { status: 'reviewed', target: null })
  }

  const toggleBan = async (report) => {
    const currentlyBanned = !!report.target?.is_banned
    setBusyId(report.id)
    const ok = await setUserBanned(report.target_id, !currentlyBanned)
    setBusyId(null)
    if (ok) patchLocal(report.id, { target: { ...report.target, is_banned: !currentlyBanned } })
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-purple-600/15 border border-purple-500/25 flex items-center justify-center text-purple-400">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">{t('admin_panel')}</h1>
          <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">{t('admin_reports_queue')}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2 bg-white/[0.03] p-1 rounded-2xl border border-white/5 w-fit">
        {STATUS_TABS.map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter transition-all ${
              status === s ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t(`admin_status_${s}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-purple-500" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
          <Check className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">{t('admin_empty_title')}</h3>
          <p className="text-xs text-gray-500">{t('admin_empty_text')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const busy = busyId === report.id
            const TypeIcon = report.target_type === 'post' ? ImageIcon : report.target_type === 'comment' ? MessageSquare : User
            return (
              <div key={report.id} className="glass-card p-5 rounded-3xl border-white/5 space-y-4">
                {/* Top row: type, reason, time, status */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-300 uppercase tracking-wider">
                      <TypeIcon className="w-3.5 h-3.5" /> {t(`admin_target_${report.target_type}`)}
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-black text-red-400 uppercase tracking-wider">
                      <Flag className="w-3.5 h-3.5" /> {t(REASON_KEY[report.reason] || 'reason_other')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'all' && (
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                        report.status === 'pending' ? 'bg-amber-500/15 text-amber-400'
                        : report.status === 'reviewed' ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-gray-500/15 text-gray-400'
                      }`}>{t(`admin_status_${report.status}`)}</span>
                    )}
                    <span className="text-[10px] text-gray-600 font-bold">{relTime(report.created_at)}</span>
                  </div>
                </div>

                {/* Details text */}
                {report.details && (
                  <p className="text-xs text-gray-400 leading-relaxed bg-black/20 border border-white/5 rounded-xl px-3 py-2">
                    “{report.details}”
                  </p>
                )}

                {/* Target preview */}
                <div className="flex items-center gap-3 p-3 bg-[#0d0c13]/80 rounded-2xl border border-white/5">
                  {report.target_type === 'post' && report.target && (
                    <>
                      <img src={report.target.image_url} alt="" className="w-14 h-14 rounded-xl object-cover bg-black/40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{report.target.title || t('untitled_work')}</p>
                        {report.target.is_nsfw && <span className="text-[10px] font-black text-red-400 uppercase">NSFW</span>}
                      </div>
                      <button onClick={() => onOpenPost?.(report.target.id, report.target, [report.target], 0)} className="p-2 text-gray-400 hover:text-purple-400 transition-colors" title={t('view_full')}>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {report.target_type === 'user' && report.target && (
                    <>
                      <ProfileAvatar avatarUrl={report.target.avatar_url} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{report.target.nickname || t('unknown_artist')}</p>
                        {report.target.is_banned && <span className="text-[10px] font-black text-red-400 uppercase">{t('admin_banned')}</span>}
                      </div>
                      <button onClick={() => onViewProfile?.(report.target.id)} className="p-2 text-gray-400 hover:text-purple-400 transition-colors" title={t('view_full')}>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {report.target_type === 'comment' && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 leading-relaxed">{report.target?.content || <span className="italic text-gray-600">{t('admin_target_removed')}</span>}</p>
                    </div>
                  )}
                  {!report.target && report.target_type !== 'comment' && (
                    <p className="text-xs italic text-gray-600">{t('admin_target_removed')}</p>
                  )}
                </div>

                {/* Reporter + actions */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {report.reporter && (
                      <>
                        <ProfileAvatar avatarUrl={report.reporter.avatar_url} size="xs" />
                        <span>{t('admin_reported_by')} <b className="text-gray-300">{report.reporter.nickname}</b></span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {report.target_type === 'post' && report.target && (
                      <button onClick={() => deletePost(report)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-red-600/90 hover:bg-red-500 text-white transition-all disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" /> {t('admin_delete_post')}
                      </button>
                    )}
                    {report.target_type === 'comment' && report.target && (
                      <button onClick={() => deleteComment(report)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-red-600/90 hover:bg-red-500 text-white transition-all disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" /> {t('admin_delete_comment')}
                      </button>
                    )}
                    {report.target_type === 'user' && report.target && (
                      <button onClick={() => toggleBan(report)} disabled={busy} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-all disabled:opacity-40 ${report.target.is_banned ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white' : 'bg-red-600/90 hover:bg-red-500 text-white'}`}>
                        <Ban className="w-3.5 h-3.5" /> {report.target.is_banned ? t('unblock') : t('admin_ban_user')}
                      </button>
                    )}

                    {report.status !== 'reviewed' && (
                      <button onClick={() => resolve(report, 'reviewed')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/25 transition-all disabled:opacity-40">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('admin_mark_reviewed')}
                      </button>
                    )}
                    {report.status !== 'dismissed' && (
                      <button onClick={() => resolve(report, 'dismissed')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-40">
                        <X className="w-3.5 h-3.5" /> {t('admin_dismiss')}
                      </button>
                    )}
                    {status === 'all' && report.status !== 'pending' && (
                      <button onClick={() => resolve(report, 'pending')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-40" title={t('admin_status_pending')}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
