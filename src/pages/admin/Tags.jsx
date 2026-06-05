import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Loader2, ChevronLeft, ChevronRight, Tag as TagIcon,
  Hash, Users, Pencil, GitMerge, Trash2, Check, X
} from 'lucide-react'
import {
  adminListTags, adminRenameTag, adminMergeTags, adminDeleteTag
} from '../../lib/supabase'

const PAGE_SIZE = 50

export function Tags() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ total: 0, tags: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [mergeSource, setMergeSource] = useState(null) // tag object being merged FROM
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (searchValue, pageValue) => {
    setLoading(true)
    setError(null)
    const res = await adminListTags({ search: searchValue, limit: PAGE_SIZE, offset: pageValue * PAGE_SIZE })
    if (!res) setError(t('admin_tags_load_error'))
    else setData(res)
    setLoading(false)
  }, [t])

  useEffect(() => { load(search, page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(0); load(value, 0) }, 350)
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  const startEdit = (tag) => { setEditingId(tag.id); setEditValue(tag.name); setError(null) }
  const cancelEdit = () => { setEditingId(null); setEditValue('') }

  const saveRename = async (tagId) => {
    const name = editValue.trim().toLowerCase()
    if (!name) return
    setBusy(true)
    const res = await adminRenameTag(tagId, name)
    setBusy(false)
    if (res.ok) { cancelEdit(); load(search, page) }
    else if (res.reason === 'tag_exists') setError(t('admin_tags_exists'))
    else setError(res.error || t('admin_tags_load_error'))
  }

  const doMerge = async (targetTag) => {
    if (!mergeSource || mergeSource.id === targetTag.id) { setMergeSource(null); return }
    if (!window.confirm(t('admin_tags_confirm_merge', { source: mergeSource.name, target: targetTag.name }))) return
    setBusy(true)
    const res = await adminMergeTags(mergeSource.id, targetTag.id)
    setBusy(false)
    setMergeSource(null)
    if (res.ok) load(search, page)
    else setError(res.error || t('admin_tags_load_error'))
  }

  const doDelete = async (tag) => {
    if (!window.confirm(t('admin_tags_confirm_delete', { name: tag.name }))) return
    setBusy(true)
    const res = await adminDeleteTag(tag.id)
    setBusy(false)
    if (res.ok) load(search, page)
    else setError(res.error || t('admin_tags_load_error'))
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('admin_tags_search')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        <span className="text-xs text-gray-500 font-bold whitespace-nowrap">{data.total} {t('admin_content_total')}</span>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
      )}

      {/* Merge mode banner */}
      {mergeSource && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-600/10 border border-purple-500/20">
          <GitMerge className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs text-purple-300">
            {t('admin_tags_merge_pick', { source: mergeSource.name })}
          </span>
          <button onClick={() => setMergeSource(null)} className="ml-auto p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[#1a1924]/60 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : data.tags.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
            <TagIcon className="w-8 h-8 text-gray-600" />
            {t('admin_tags_empty')}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
              <span>{t('admin_tags_name')}</span>
              <span className="text-right">{t('admin_tags_usage')}</span>
              <span className="text-right">{t('admin_tags_followers')}</span>
              <span className="text-right pr-1">{t('admin_tags_actions')}</span>
            </div>
            {data.tags.map(tag => {
              const isMergeTarget = mergeSource && mergeSource.id !== tag.id
              const isEditing = editingId === tag.id
              return (
                <div
                  key={tag.id}
                  className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 ${
                    isMergeTarget ? 'cursor-pointer hover:bg-purple-600/10' : 'hover:bg-white/[0.02]'
                  } ${mergeSource?.id === tag.id ? 'bg-purple-600/10' : ''} transition-colors`}
                  onClick={isMergeTarget ? () => doMerge(tag) : undefined}
                >
                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(tag.id); if (e.key === 'Escape') cancelEdit() }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-[#15141d] border border-purple-500/40 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
                      />
                    ) : (
                      <span className="text-sm font-bold text-white truncate">{tag.name}</span>
                    )}
                  </div>

                  {/* Usage (desktop) */}
                  <span className="hidden sm:flex items-center justify-end gap-1 text-xs text-gray-400 whitespace-nowrap">
                    <span className="text-gray-600">{t('admin_tags_usage')}:</span> {tag.usage_count}
                  </span>
                  {/* Followers (desktop) */}
                  <span className="hidden sm:flex items-center justify-end gap-1 text-xs text-gray-400 whitespace-nowrap">
                    <Users className="w-3 h-3 text-gray-600" /> {tag.follower_count}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <>
                        <button onClick={() => saveRename(tag.id)} disabled={busy}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-40">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Mobile counts */}
                        <span className="sm:hidden text-[11px] text-gray-500 mr-1">{tag.usage_count} · {tag.follower_count}</span>
                        <button onClick={() => startEdit(tag)} title={t('admin_tags_rename')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setMergeSource(tag)} title={t('admin_tags_merge')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-300 hover:bg-purple-500/15 transition-all">
                          <GitMerge className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => doDelete(tag)} title={t('admin_tags_delete')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/15 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && data.total > PAGE_SIZE && (
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
