import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Loader2, ChevronLeft, ChevronRight, ScrollText, RefreshCw, Filter
} from 'lucide-react'
import { adminListLogs, adminLogFacets } from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'

const PAGE_SIZE = 50

// Цвета бейджей для типов действий — по ключевому слову в названии.
const actionAccent = (action = '') => {
  const a = action.toLowerCase()
  if (/(delete|remove|ban|reject|refund|cancel)/.test(a)) return 'bg-red-500/15 text-red-400'
  if (/(create|add|grant|approve|restore|unban)/.test(a)) return 'bg-emerald-500/15 text-emerald-400'
  if (/(update|edit|change|set)/.test(a)) return 'bg-amber-500/15 text-amber-400'
  return 'bg-purple-500/15 text-purple-300'
}

export function Logs() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ total: 0, items: [] })
  const [facets, setFacets] = useState({ actions: [], targets: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (searchValue, actionValue, targetValue, pageValue) => {
    setLoading(true)
    setError(false)
    const res = await adminListLogs({
      search: searchValue, action: actionValue, targetType: targetValue,
      limit: PAGE_SIZE, offset: pageValue * PAGE_SIZE,
    })
    if (!res) setError(true)
    else setData(res)
    setLoading(false)
  }, [])

  useEffect(() => { load(search, action, targetType, page) }, [page, action, targetType]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { adminLogFacets().then(setFacets) }, [])

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(0); load(value, action, targetType, 0) }, 350)
  }

  const refresh = () => {
    load(search, action, targetType, page)
    adminLogFacets().then(setFacets)
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    } catch { return '—' }
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('admin_logs_search')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 text-gray-500">
          <Filter className="w-3.5 h-3.5" />
        </div>

        <select
          value={action}
          onChange={(e) => { setPage(0); setAction(e.target.value) }}
          className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 focus:outline-none focus:border-purple-500/50 transition-all max-w-[180px]"
        >
          <option value="">{t('admin_logs_all_actions')}</option>
          {facets.actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={targetType}
          onChange={(e) => { setPage(0); setTargetType(e.target.value) }}
          className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 focus:outline-none focus:border-purple-500/50 transition-all max-w-[180px]"
        >
          <option value="">{t('admin_logs_all_targets')}</option>
          {facets.targets.map(tt => <option key={tt} value={tt}>{tt}</option>)}
        </select>

        <button
          onClick={refresh}
          title={t('admin_logs_refresh')}
          className="p-2.5 rounded-xl text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
          {data.total} {t('admin_content_total')}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#1a1924]/60 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-400">{t('admin_logs_load_error')}</div>
        ) : data.items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <ScrollText className="w-8 h-8 text-gray-600" />
            {t('admin_logs_empty')}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header (desktop) */}
            <div className="hidden md:grid grid-cols-[1.2fr_auto_1fr_1.2fr] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <span>{t('admin_logs_admin')}</span>
              <span>{t('admin_logs_action')}</span>
              <span>{t('admin_logs_target')}</span>
              <span className="text-right">{t('admin_logs_when')}</span>
            </div>
            {data.items.map(log => (
              <LogRow key={log.id} log={log} fmtDate={fmtDate} />
            ))}
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
    </div>
  )
}

function LogRow({ log, fmtDate }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const hasMeta = log.meta && Object.keys(log.meta).length > 0

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1.2fr_auto_1fr_1.2fr] gap-3 items-center">
        {/* Admin */}
        <div className="flex items-center gap-2.5 min-w-0">
          <ProfileAvatar avatarUrl={log.admin_avatar} size="sm" />
          <span className="text-sm font-bold text-white truncate">{log.admin_nickname || t('admin_logs_unknown_admin')}</span>
        </div>

        {/* Action */}
        <div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${actionAccent(log.action)}`}>
            {log.action}
          </span>
        </div>

        {/* Target (desktop) */}
        <div className="hidden md:flex flex-col min-w-0">
          <span className="text-xs font-bold text-gray-300 truncate">{log.target_type || '—'}</span>
          {log.target_id && (
            <span className="text-[10px] text-gray-500 font-mono truncate">{log.target_id}</span>
          )}
        </div>

        {/* When */}
        <span className="hidden md:block text-xs text-gray-500 text-right whitespace-nowrap">{fmtDate(log.created_at)}</span>
      </div>

      {/* Mobile target + when */}
      <div className="md:hidden mt-1.5 flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span className="truncate">{log.target_type}{log.target_id ? ` · ${log.target_id}` : ''}</span>
        <span className="whitespace-nowrap">{fmtDate(log.created_at)}</span>
      </div>

      {/* Meta */}
      {hasMeta && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] font-bold uppercase tracking-wider text-purple-400 hover:text-purple-300 transition-colors"
          >
            {expanded ? t('admin_logs_hide_meta') : t('admin_logs_show_meta')}
          </button>
          {expanded && (
            <pre className="mt-1.5 p-2.5 rounded-lg bg-black/40 border border-white/5 text-[11px] text-gray-400 font-mono overflow-x-auto custom-scrollbar whitespace-pre-wrap break-all">
              {JSON.stringify(log.meta, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
