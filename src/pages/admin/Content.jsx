import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, Loader2, ChevronLeft, ChevronRight, Trash2, EyeOff, Eye,
  FileImage, Clapperboard, Tag as TagIcon, Heart, MessageCircle, Clock,
  CheckSquare, Square, X, Sparkles
} from 'lucide-react'
import {
  adminListContent, adminBulkDeletePaintings, adminBulkDeleteStories,
  adminBulkSetNsfw
} from '../../lib/supabase'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { AnimatedPillGroup } from '../../components/AnimatedPillGroup'

const Tags = lazy(() => import('./Tags').then(m => ({ default: m.Tags })))

const PAGE_SIZE = 24

export function Content({ onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState('posts') // posts | stories | tags

  const SUBTABS = [
    { id: 'posts', icon: FileImage, label: t('admin_content_posts') },
    { id: 'stories', icon: Clapperboard, label: t('admin_content_stories') },
    { id: 'tags', icon: TagIcon, label: t('admin_content_tags') },
  ]

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <AnimatedPillGroup
        value={mode}
        onChange={setMode}
        options={SUBTABS.map(s => ({ value: s.id, label: s.label, icon: <s.icon className="w-3.5 h-3.5" /> }))}
        containerClassName="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/5 rounded-xl w-fit"
        buttonClassName="lg-pill flex items-center px-3 py-1.5 rounded-lg text-xs font-bold"
        pillVariant="glass"
      />

      {mode === 'tags' ? (
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>}>
          <Tags />
        </Suspense>
      ) : (
        <ContentFeed key={mode} type={mode === 'stories' ? 'story' : 'post'} onViewProfile={onViewProfile} t={t} lang={i18n.language} />
      )}
    </div>
  )
}

function ContentFeed({ type, onViewProfile, t, lang }) {
  const isStory = type === 'story'
  const [search, setSearch] = useState('')
  const [nsfw, setNsfw] = useState('all')
  const [page, setPage] = useState(0)
  const [data, setData] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (searchValue, nsfwValue, pageValue) => {
    setLoading(true)
    setError(false)
    const res = await adminListContent({
      type, search: searchValue, nsfw: nsfwValue,
      limit: PAGE_SIZE, offset: pageValue * PAGE_SIZE,
    })
    if (!res) setError(true)
    else setData(res)
    setSelected(new Set())
    setLoading(false)
  }, [type])

  useEffect(() => { load(search, nsfw, page) }, [page, nsfw]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSearchChange = (value) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(0); load(value, nsfw, 0) }, 350)
  }

  const fmtDate = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US') } catch { return '—' }
  }

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE))

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === data.items.length) setSelected(new Set())
    else setSelected(new Set(data.items.map(i => i.id)))
  }

  const ids = () => Array.from(selected)

  const doDelete = async () => {
    if (!selected.size) return
    if (!window.confirm(t('admin_content_confirm_delete', { count: selected.size }))) return
    setBusy(true)
    const res = isStory
      ? await adminBulkDeleteStories(ids())
      : await adminBulkDeletePaintings(ids())
    setBusy(false)
    if (res.ok) load(search, nsfw, page)
    else setError(true)
  }

  const doSetNsfw = async (value) => {
    if (!selected.size) return
    setBusy(true)
    const res = await adminBulkSetNsfw(ids(), value)
    setBusy(false)
    if (res.ok) load(search, nsfw, page)
    else setError(true)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isStory ? t('admin_content_search_stories') : t('admin_content_search_posts')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-all"
          />
        </div>
        {!isStory && (
          <AnimatedPillGroup
            value={nsfw}
            onChange={(v) => { setPage(0); setNsfw(v) }}
            options={['all', 'nsfw', 'sfw'].map(v => ({ value: v, label: t(`admin_content_filter_${v}`) }))}
            containerClassName="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/5 rounded-xl"
            buttonClassName="lg-pill px-3 py-1.5 rounded-lg text-xs font-bold"
            pillVariant="glass"
          />
        )}
        <span className="text-xs text-gray-500 font-bold whitespace-nowrap">
          {data.total} {t('admin_content_total')}
        </span>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-600/10 border border-purple-500/20 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-xs font-bold text-purple-300">
            {t('admin_content_selected', { count: selected.size })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!isStory && (
              <>
                <button onClick={() => doSetNsfw(true)} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all disabled:opacity-40">
                  <EyeOff className="w-3.5 h-3.5" /> {t('admin_content_mark_nsfw')}
                </button>
                <button onClick={() => doSetNsfw(false)} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-40">
                  <Eye className="w-3.5 h-3.5" /> {t('admin_content_unmark_nsfw')}
                </button>
              </>
            )}
            <button onClick={doDelete} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} {t('admin_content_delete')}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-red-400">{t('admin_content_load_error')}</div>
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
          <FileImage className="w-8 h-8 text-gray-600" />
          {t('admin_content_empty')}
        </div>
      ) : (
        <>
          <button onClick={selectAll} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors">
            {selected.size === data.items.length ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
            {t('admin_content_select_all')}
          </button>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.items.map(item => {
              const isSel = selected.has(item.id)
              return (
                <div
                  key={item.id}
                  className={`relative group rounded-2xl overflow-hidden border transition-all ${
                    isSel ? 'border-purple-500 ring-2 ring-purple-500/40' : 'border-white/5'
                  } bg-[#15141d]/60 backdrop-blur-xl`}
                >
                  {/* Image */}
                  <button onClick={() => toggleSelect(item.id)} className="block w-full aspect-square bg-white/5 relative">
                    {item.image_url && (
                      <img src={item.image_url} alt="" loading="lazy"
                        className={`w-full h-full object-cover ${item.is_nsfw ? 'blur-md' : ''}`} />
                    )}
                    {/* Checkbox overlay */}
                    <span className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                      isSel ? 'bg-purple-600 text-white' : 'bg-black/50 text-white/70 group-hover:bg-black/70'
                    }`}>
                      {isSel ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </span>
                    {/* Badges */}
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                      {item.is_nsfw && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/80 text-black">NSFW</span>
                      )}
                      {item.is_ai_generated && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-fuchsia-500/80 text-white">
                          <Sparkles className="w-2.5 h-2.5" /> AI
                        </span>
                      )}
                      {item.is_expired && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-600/80 text-white">
                          {t('admin_content_expired')}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Meta */}
                  <div className="p-2.5 space-y-1.5">
                    <p className="text-xs font-bold text-white truncate">{item.title || item.caption || t('admin_content_untitled')}</p>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onViewProfile?.(item.user_id)}
                        className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                      >
                        <ProfileAvatar avatarUrl={item.author_avatar} size="xs" />
                        <span className="text-[11px] text-gray-400 truncate">{item.author_nickname || '—'}</span>
                      </button>
                      <span className="text-[10px] text-gray-600 whitespace-nowrap shrink-0">{fmtDate(item.created_at)}</span>
                    </div>
                    {!isStory && (
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{item.likes_count ?? 0}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{item.comments_count ?? 0}</span>
                      </div>
                    )}
                    {isStory && item.expires_at && !item.is_expired && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-3 h-3" />{t('admin_content_expires')} {fmtDate(item.expires_at)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

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
