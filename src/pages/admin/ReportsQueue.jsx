import { useState, useEffect, useCallback, useMemo } from 'react'
import { Flag, Loader2, Trash2, Ban, Check, X, ExternalLink, Image as ImageIcon, User, MessageSquare, RotateCcw, Search, CheckSquare, Square, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import {
  fetchReports, updateReportStatus, adminDeletePainting, adminDeleteComment, setUserBanned, logAdminAction,
  adminBulkUpdateReports, adminNotifyUser
} from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { AnimatedPillGroup } from '../../components/AnimatedPillGroup'

const STATUS_TABS = ['pending', 'reviewed', 'dismissed', 'all']
const REASONS = ['spam', 'inappropriate', 'harassment', 'nsfw', 'copyright', 'other']
const REASON_KEY = {
  spam: 'reason_spam', inappropriate: 'reason_inappropriate', harassment: 'reason_harassment',
  nsfw: 'reason_nsfw', copyright: 'reason_copyright', other: 'reason_other',
}

export function ReportsQueue({ onOpenPost, onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState('pending')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)
  const [reasonFilter, setReasonFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set()) // group keys
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchReports(status)
    setReports(data)
    setSelected(new Set())
    setLoading(false)
  }, [status])

  useEffect(() => { load() }, [load])

  const relTime = (d) => {
    try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: i18n.language === 'ru' ? ru : enUS }) }
    catch { return '' }
  }

  // Mutate the local list after an action, then drop empty/resolved entries.
  const removeIds = (ids) => setReports(prev => prev.filter(r => !ids.includes(r.id)))
  const patchIds = (ids, patch) => setReports(prev => prev.map(r => ids.includes(r.id) ? { ...r, ...patch } : r))

  // ---- Filtering (reason + free-text search) ----------------------------
  const haystack = (r) => [
    r.details, r.reporter?.nickname,
    r.target?.title, r.target?.nickname, r.target?.content,
  ].filter(Boolean).join(' ').toLowerCase()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports.filter(r =>
      (reasonFilter === 'all' || r.reason === reasonFilter) &&
      (!q || haystack(r).includes(q))
    )
  }, [reports, reasonFilter, search])

  // ---- Grouping: several reports on one target → one card with a count ----
  const groups = useMemo(() => {
    const map = new Map()
    for (const r of filtered) {
      const key = `${r.target_type}:${r.target_id}`
      if (!map.has(key)) {
        map.set(key, { key, target_type: r.target_type, target_id: r.target_id, target: r.target, reports: [] })
      }
      const g = map.get(key)
      g.reports.push(r)
      if (r.target && !g.target) g.target = r.target
    }
    // Sort each group's reports newest-first; expose head + derived fields.
    return [...map.values()].map(g => {
      const sorted = [...g.reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      return {
        ...g,
        reports: sorted,
        ids: sorted.map(r => r.id),
        head: sorted[0],
        reasons: [...new Set(sorted.map(r => r.reason))],
        latestAt: sorted[0].created_at,
      }
    }).sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
  }, [filtered])

  // ---- Selection --------------------------------------------------------
  const toggleSelect = (key) => setSelected(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const allSelected = groups.length > 0 && groups.every(g => selected.has(g.key))
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(groups.map(g => g.key)))

  // Resolve every report id of a group in one shot (group never loses members).
  const resolveIds = async (ids, newStatus) => {
    if (ids.length === 1) {
      const ok = await updateReportStatus(ids[0], newStatus)
      if (ok) await logAdminAction('update_report_status', 'report', ids[0], { newStatus })
      return ok
    }
    const res = await adminBulkUpdateReports(ids, newStatus)
    return res.ok
  }

  const resolveGroup = async (group, newStatus) => {
    setBusyKey(group.key)
    const ok = await resolveIds(group.ids, newStatus)
    setBusyKey(null)
    if (!ok) return
    if (status !== 'all') removeIds(group.ids)
    else patchIds(group.ids, { status: newStatus })
  }

  // ---- Bulk action bar --------------------------------------------------
  const bulkResolve = async (newStatus) => {
    const chosen = groups.filter(g => selected.has(g.key))
    if (!chosen.length) return
    const ids = chosen.flatMap(g => g.ids)
    setBulkBusy(true)
    const res = await adminBulkUpdateReports(ids, newStatus)
    setBulkBusy(false)
    if (!res.ok) return
    if (status !== 'all') removeIds(ids)
    else patchIds(ids, { status: newStatus })
    setSelected(new Set())
  }

  // ---- Destructive actions (notify the affected user once per event) -----
  const notify = (userId, kind, content) => userId && adminNotifyUser(userId, kind, content)

  const deletePost = async (group) => {
    const { head, target_id, ids } = group
    if (!window.confirm(t('admin_confirm_delete_post'))) return
    setBusyKey(group.key)
    const ok = await adminDeletePainting(target_id)
    if (ok) {
      await logAdminAction('delete_post', 'post', target_id, { reportIds: ids })
      await notify(head.target?.user_id, 'moderation_delete', t('admin_notify_post_removed'))
      await resolveIds(ids, 'reviewed')
    }
    setBusyKey(null)
    if (ok && status !== 'all') removeIds(ids)
    else if (ok) patchIds(ids, { status: 'reviewed', target: null })
  }

  const deleteComment = async (group) => {
    const { head, target_id, ids } = group
    if (!window.confirm(t('admin_confirm_delete_comment'))) return
    setBusyKey(group.key)
    const ok = await adminDeleteComment(target_id)
    if (ok) {
      await logAdminAction('delete_comment', 'comment', target_id, { reportIds: ids })
      await notify(head.target?.user_id, 'moderation_delete', t('admin_notify_comment_removed'))
      await resolveIds(ids, 'reviewed')
    }
    setBusyKey(null)
    if (ok && status !== 'all') removeIds(ids)
    else if (ok) patchIds(ids, { status: 'reviewed', target: null })
  }

  const toggleBan = async (group) => {
    const { target, target_id, ids } = group
    const currentlyBanned = !!target?.is_banned
    setBusyKey(group.key)
    const ok = await setUserBanned(target_id, !currentlyBanned)
    if (ok) {
      await logAdminAction(currentlyBanned ? 'unban_user' : 'ban_user', 'user', target_id, { reportIds: ids })
      await notify(target_id, currentlyBanned ? 'moderation_unban' : 'moderation_ban',
        currentlyBanned ? t('admin_notify_unbanned') : t('admin_notify_banned'))
    }
    setBusyKey(null)
    if (ok) patchIds(ids, { target: { ...target, is_banned: !currentlyBanned } })
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      {/* Status filter */}
      <AnimatedPillGroup
        value={status}
        onChange={setStatus}
        options={STATUS_TABS.map(s => ({ value: s, label: t(`admin_status_${s}`) }))}
        containerClassName="flex flex-wrap items-center gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-fit"
        buttonClassName="lg-pill px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter"
        pillVariant="glass"
      />

      {/* Reason filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#15141d]/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setReasonFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              reasonFilter === 'all' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >{t('admin_reason_all')}</button>
          {REASONS.map(r => (
            <button
              key={r}
              onClick={() => setReasonFilter(r)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                reasonFilter === r ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-white'
              }`}
            >{t(REASON_KEY[r])}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin_search_reports')}
            className="w-full pl-9 pr-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-2xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/25 transition-all"
          />
        </div>
      </div>

      {/* Bulk selection bar */}
      {!loading && groups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-2xl">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors">
            {allSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
            {t('admin_select_all')}
            {selected.size > 0 && <span className="text-purple-400">· {selected.size}</span>}
          </button>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => bulkResolve('reviewed')} disabled={bulkBusy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/25 transition-all disabled:opacity-40">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('admin_mark_reviewed')}
              </button>
              <button onClick={() => bulkResolve('dismissed')} disabled={bulkBusy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-40">
                <X className="w-3.5 h-3.5" /> {t('admin_dismiss')}
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-purple-500" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-3">
          <Check className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">{t('admin_empty_title')}</h3>
          <p className="text-xs text-gray-500">{reasonFilter !== 'all' || search ? t('admin_no_match') : t('admin_empty_text')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const { head: report, ids, reports: groupReports } = group
            const busy = busyKey === group.key
            const isSelected = selected.has(group.key)
            const count = ids.length
            const TypeIcon = group.target_type === 'post' ? ImageIcon : group.target_type === 'comment' ? MessageSquare : User
            return (
              <div key={group.key} className={`glass-card p-5 rounded-3xl space-y-4 transition-colors ${isSelected ? 'border-purple-500/40' : 'border-white/5'}`}>
                {/* Top row: select, type, reason(s), count, time, status */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => toggleSelect(group.key)} className="p-0.5 text-gray-500 hover:text-purple-400 transition-colors" title={t('admin_select')}>
                      {isSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
                    </button>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-gray-300 uppercase tracking-wider">
                      <TypeIcon className="w-3.5 h-3.5" /> {t(`admin_target_${group.target_type}`)}
                    </span>
                    {group.reasons.map(reason => (
                      <span key={reason} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-black text-red-400 uppercase tracking-wider">
                        <Flag className="w-3.5 h-3.5" /> {t(REASON_KEY[reason] || 'reason_other')}
                      </span>
                    ))}
                    {count > 1 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/15 border border-purple-500/30 rounded-lg text-[10px] font-black text-purple-300 uppercase tracking-wider" title={t('admin_reports_count')}>
                        <Layers className="w-3.5 h-3.5" /> {count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'all' && (
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                        report.status === 'pending' ? 'bg-amber-500/15 text-amber-400'
                        : report.status === 'reviewed' ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-gray-500/15 text-gray-400'
                      }`}>{t(`admin_status_${report.status}`)}</span>
                    )}
                    <span className="text-[10px] text-gray-600 font-bold">{relTime(group.latestAt)}</span>
                  </div>
                </div>

                {/* Details text (one line per distinct report with details) */}
                {groupReports.some(r => r.details) && (
                  <div className="space-y-1.5">
                    {groupReports.filter(r => r.details).map(r => (
                      <p key={r.id} className="text-xs text-gray-400 leading-relaxed bg-black/20 border border-white/5 rounded-xl px-3 py-2">
                        “{r.details}”
                      </p>
                    ))}
                  </div>
                )}

                {/* Target preview */}
                <div className="flex items-center gap-3 p-3 bg-[#0d0c13]/80 rounded-2xl border border-white/5">
                  {group.target_type === 'post' && group.target && (
                    <>
                      <img src={group.target.image_url} alt="" className="w-14 h-14 rounded-xl object-cover bg-black/40" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{group.target.title || t('untitled_work')}</p>
                        {group.target.is_nsfw && <span className="text-[10px] font-black text-red-400 uppercase">NSFW</span>}
                      </div>
                      <button onClick={() => onOpenPost?.(group.target.id, group.target, [group.target], 0)} className="p-2 text-gray-400 hover:text-purple-400 transition-colors" title={t('view_full')}>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {group.target_type === 'user' && group.target && (
                    <>
                      <ProfileAvatar avatarUrl={group.target.avatar_url} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{group.target.nickname || t('unknown_artist')}</p>
                        {group.target.is_banned && <span className="text-[10px] font-black text-red-400 uppercase">{t('admin_banned')}</span>}
                      </div>
                      <button onClick={() => onViewProfile?.(group.target.id)} className="p-2 text-gray-400 hover:text-purple-400 transition-colors" title={t('view_full')}>
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {group.target_type === 'comment' && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 leading-relaxed">{group.target?.content || <span className="italic text-gray-600">{t('admin_target_removed')}</span>}</p>
                    </div>
                  )}
                  {!group.target && group.target_type !== 'comment' && (
                    <p className="text-xs italic text-gray-600">{t('admin_target_removed')}</p>
                  )}
                </div>

                {/* Reporter(s) + actions */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    {report.reporter && (
                      <>
                        <ProfileAvatar avatarUrl={report.reporter.avatar_url} size="xs" />
                        <span>
                          {t('admin_reported_by')} <b className="text-gray-300">{report.reporter.nickname}</b>
                          {count > 1 && <span className="text-gray-600"> +{count - 1}</span>}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {group.target_type === 'post' && group.target && (
                      <button onClick={() => deletePost(group)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-red-600/90 hover:bg-red-500 text-white transition-all disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" /> {t('admin_delete_post')}
                      </button>
                    )}
                    {group.target_type === 'comment' && group.target && (
                      <button onClick={() => deleteComment(group)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-red-600/90 hover:bg-red-500 text-white transition-all disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" /> {t('admin_delete_comment')}
                      </button>
                    )}
                    {group.target_type === 'user' && group.target && (
                      <button onClick={() => toggleBan(group)} disabled={busy} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition-all disabled:opacity-40 ${group.target.is_banned ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white' : 'bg-red-600/90 hover:bg-red-500 text-white'}`}>
                        <Ban className="w-3.5 h-3.5" /> {group.target.is_banned ? t('unblock') : t('admin_ban_user')}
                      </button>
                    )}

                    {report.status !== 'reviewed' && (
                      <button onClick={() => resolveGroup(group, 'reviewed')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/25 transition-all disabled:opacity-40">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('admin_mark_reviewed')}
                      </button>
                    )}
                    {report.status !== 'dismissed' && (
                      <button onClick={() => resolveGroup(group, 'dismissed')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-40">
                        <X className="w-3.5 h-3.5" /> {t('admin_dismiss')}
                      </button>
                    )}
                    {status === 'all' && report.status !== 'pending' && (
                      <button onClick={() => resolveGroup(group, 'pending')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-40" title={t('admin_status_pending')}>
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
