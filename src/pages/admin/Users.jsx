import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Loader2, ChevronLeft, ChevronRight, Star, Ban, Users as UsersIcon } from 'lucide-react'
import { adminSearchUsers } from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { UserCard } from './UserCard'

const PAGE_SIZE = 25

export function Users({ adminRole, onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ total: 0, users: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const debounceRef = useRef(null)

  const load = useCallback(async (searchValue, pageValue) => {
    setLoading(true)
    setError(false)
    const res = await adminSearchUsers({ search: searchValue, limit: PAGE_SIZE, offset: pageValue * PAGE_SIZE })
    if (!res) setError(true)
    else setData(res)
    setLoading(false)
  }, [])

  useEffect(() => { load(search, page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — resets to page 0.
  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(0)
      load(value, 0)
    }, 350)
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US') } catch { return '—' }
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('admin_users_search')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
          {data.total} {t('admin_users_total')}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#1a1924]/60 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-400">{t('admin_users_load_error')}</div>
        ) : data.users.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <UsersIcon className="w-8 h-8 text-gray-600" />
            {t('admin_users_empty')}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header (desktop) */}
            <div className="hidden md:grid grid-cols-[1fr_1.3fr_auto_auto] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <span>{t('admin_users_user')}</span>
              <span>{t('admin_users_email')}</span>
              <span className="text-right">{t('admin_users_joined')}</span>
              <span className="text-right pr-1">{t('admin_users_status')}</span>
            </div>
            {data.users.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1fr_1.3fr_auto_auto] gap-3 items-center px-4 py-3 text-left hover:bg-white/5 transition-colors"
              >
                {/* User */}
                <div className="flex items-center gap-3 min-w-0">
                  <ProfileAvatar avatarUrl={u.avatar_url} size="sm" isPro={u.is_pro} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white truncate">{u.nickname || 'Unknown'}</span>
                      {u.is_pro && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                      {u.admin_role && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/15 text-purple-300 shrink-0">{u.admin_role}</span>
                      )}
                    </div>
                    <span className="md:hidden text-xs text-gray-500 truncate block">{u.email || '—'}</span>
                  </div>
                </div>

                {/* Email (desktop) */}
                <span className="hidden md:block text-xs text-gray-400 truncate">{u.email || '—'}</span>

                {/* Joined (desktop) */}
                <span className="hidden md:block text-xs text-gray-500 text-right whitespace-nowrap">{fmtDate(u.created_at)}</span>

                {/* Status */}
                <div className="flex items-center justify-end gap-1.5">
                  {u.is_banned && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400">
                      <Ban className="w-2.5 h-2.5" />
                      <span className="hidden sm:inline">{t('admin_banned')}</span>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('admin_users_prev')}
          </button>
          <span className="text-xs text-gray-500 font-bold">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 transition-all disabled:opacity-30"
          >
            {t('admin_users_next')}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User detail card */}
      {selectedId && (
        <UserCard
          userId={selectedId}
          adminRole={adminRole}
          onClose={() => setSelectedId(null)}
          onViewProfile={onViewProfile}
          onChanged={() => load(search, page)}
        />
      )}
    </div>
  )
}
