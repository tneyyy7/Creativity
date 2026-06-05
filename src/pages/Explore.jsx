import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, SlidersHorizontal, Grid, Star, Tag, X, Flame, Calendar, BadgeCheck, Loader2, Sparkles, Heart, MessageSquare, Bookmark, Compass, UserPlus, Check, Gem, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchExplorePaintings, fetchRecommendedCreators, fetchForYouPaintings, fetchBlockedIds, fetchBannedIds, togglePostLike, toggleBookmark, toggleFollow, isBookmarked } from '../lib/supabase'
import { StoriesBanner } from '../components/StoriesBanner'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { getNicknameStyle } from '../lib/nicknameStyle'
import { AnimatedPillGroup } from '../components/AnimatedPillGroup'
import SmartImage from '../components/SmartImage'

// Базовые классы переключателей (как в оригинальной вёрстке) — общие для групп.
const TAB_CONTAINER = 'relative flex items-center gap-2 bg-white/[0.03] p-1 rounded-2xl border border-white/5 shadow-inner'
const TAB_BUTTON = 'lg-pill flex items-center justify-center gap-1.5 font-black uppercase tracking-tighter text-xs whitespace-nowrap rounded-xl px-3.5 py-2'

export function Explore({ currentUser, nickname, avatarUrl, isPro, onOpenPost, onViewProfile, initialCategory = 'All', onCategoryChange }) {
  const { t, i18n } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState('foryou') // 'foryou', 'feed' (subscriptions) or 'explore' (global search)

  // Loading states
  const [loading, setLoading] = useState(true)
  
  // Feed state variables
  const [forYouPosts, setForYouPosts] = useState([])
  const [recommended, setRecommended] = useState([])
  const [likedMap, setLikedMap] = useState({})
  const [bookmarkedMap, setBookmarkedMap] = useState({})
  const [followingMap, setFollowingMap] = useState({})

  // Server-side pagination state (replaces client-side slicing)
  const FEED_PAGE_SIZE = 10
  const EXPLORE_PAGE_SIZE = 12
  const [forYouHasMore, setForYouHasMore] = useState(false)
  const [exploreHasMore, setExploreHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const forYouPageRef = useRef(0)
  const explorePageRef = useRef(0)
  const loadMoreRef = useRef(null) // IntersectionObserver sentinel

  // Blocked authors (resolved once per user) + NSFW reveal toggles
  const [blockedIds, setBlockedIds] = useState([])
  const [revealedNsfw, setRevealedNsfw] = useState({})

  // Explore search & filter state variables
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)

  // Sync category changes from parent prop
  useEffect(() => {
    if (initialCategory && initialCategory !== selectedCategory) {
      setSelectedCategory(initialCategory)
    }
  }, [initialCategory])

  // Notify parent of internal category changes
  useEffect(() => {
    if (onCategoryChange && selectedCategory) {
      onCategoryChange(selectedCategory)
    }
  }, [selectedCategory, onCategoryChange])
  const [selectedTag, setSelectedTag] = useState('')
  const [sortBy, setSortBy] = useState('recent') // 'recent' or 'popular'
  const [explorePaintings, setExplorePaintings] = useState([])

  const categories = [
    'All',
    'Digital',
    'Painting',
    'Photography',
    'Sculpture',
    'Design',
    '3D',
    'Sketching'
  ]

  // Authors to hide from feeds: per-user blocks + globally banned users.
  useEffect(() => {
    if (!currentUser) { setBlockedIds([]); return }
    let cancelled = false
    Promise.all([fetchBlockedIds(currentUser.id), fetchBannedIds()]).then(([blocked, banned]) => {
      if (!cancelled) setBlockedIds([...new Set([...blocked, ...banned])])
    })
    return () => { cancelled = true }
  }, [currentUser])

  // Batch-load the current user's like/bookmark state for a set of post ids and
  // merge it into the existing maps (so appended pages keep prior pages' state).
  const hydrateInteractionState = useCallback(async (postIds) => {
    if (!currentUser || postIds.length === 0) return
    const [likesRes, bookmarksRes] = await Promise.all([
      supabase.from('post_likes').select('painting_id').eq('user_id', currentUser.id).in('painting_id', postIds),
      supabase.from('bookmarks').select('painting_id').eq('user_id', currentUser.id).in('painting_id', postIds)
    ])
    const likes = {}
    const bookmarks = {}
    postIds.forEach(id => { likes[id] = false; bookmarks[id] = false })
    if (!likesRes.error) likesRes.data?.forEach(l => { likes[l.painting_id] = true })
    if (!bookmarksRes.error) bookmarksRes.data?.forEach(b => { bookmarks[b.painting_id] = true })
    setLikedMap(prev => ({ ...prev, ...likes }))
    setBookmarkedMap(prev => ({ ...prev, ...bookmarks }))
  }, [currentUser])

  // Loader: For You (Algorithmic) — server-paginated
  const loadForYou = useCallback(async ({ reset = false } = {}) => {
    if (!currentUser) return
    const page = reset ? 0 : forYouPageRef.current
    reset ? setLoading(true) : setLoadingMore(true)
    try {
      const { items, hasMore } = await fetchForYouPaintings(currentUser.id, {
        page,
        pageSize: FEED_PAGE_SIZE,
        blockedIds
      })
      if (reset) {
        const creators = await fetchRecommendedCreators(currentUser.id, blockedIds)
        setRecommended(creators || [])
      }
      setForYouPosts(prev => reset ? items : [...prev, ...items])
      setForYouHasMore(hasMore)
      forYouPageRef.current = page + 1
      await hydrateInteractionState(items.map(p => p.id))
    } catch (err) {
      console.error('Error loading For You feed:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [currentUser, blockedIds, hydrateInteractionState])

  // ----------------------------------------------------
  // Loader: Explore (Global Search & Filters) — server-paginated
  // ----------------------------------------------------
  const loadExplore = useCallback(async ({ reset = false } = {}) => {
    const page = reset ? 0 : explorePageRef.current
    reset ? setLoading(true) : setLoadingMore(true)
    try {
      const { items, hasMore } = await fetchExplorePaintings(
        {
          searchQuery,
          category: selectedCategory,
          onlyFinished: true, // Always filter by finished works
          tag: selectedTag,
          sort: sortBy
        },
        { page, pageSize: EXPLORE_PAGE_SIZE, blockedIds }
      )
      setExplorePaintings(prev => reset ? items : [...prev, ...items])
      setExploreHasMore(hasMore)
      explorePageRef.current = page + 1
    } catch (err) {
      console.error('Error loading explore paintings:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [searchQuery, selectedCategory, selectedTag, sortBy, blockedIds])

  // Reset + reload the active tab whenever its inputs change.
  useEffect(() => {
    if (activeSubTab === 'foryou') {
      forYouPageRef.current = 0
      loadForYou({ reset: true })
    } else {
      explorePageRef.current = 0
      const delayDebounce = setTimeout(() => loadExplore({ reset: true }), 400) // debounce search typing
      return () => clearTimeout(delayDebounce)
    }
  }, [activeSubTab, searchQuery, selectedCategory, selectedTag, sortBy, currentUser, blockedIds])

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    
    let hasMore = false
    if (activeSubTab === 'foryou') hasMore = forYouHasMore
    else hasMore = exploreHasMore
    
    if (!hasMore) return
 
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore && !loading) {
        if (activeSubTab === 'foryou') loadForYou()
        else loadExplore()
      }
    }, { rootMargin: '400px' })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeSubTab, forYouHasMore, exploreHasMore, loadingMore, loading, loadForYou, loadExplore])

  const toggleNsfwReveal = (id) => setRevealedNsfw(prev => ({ ...prev, [id]: !prev[id] }))

  // Recommended creator follow action
  const handleFollowRecommended = async (targetId) => {
    if (!currentUser) return
    const followed = await toggleFollow(currentUser.id, targetId)
    setFollowingMap(prev => ({ ...prev, [targetId]: followed }))

    setTimeout(() => {
      forYouPageRef.current = 0
      loadForYou({ reset: true })
    }, 800)
  }

  const handleLike = async (postId) => {
    if (!currentUser) return
    const liked = await togglePostLike(postId, currentUser.id)
    setLikedMap(prev => ({ ...prev, [postId]: liked }))
  }

  const handleBookmark = async (postId) => {
    if (!currentUser) return
    const saved = await toggleBookmark(currentUser.id, postId)
    setBookmarkedMap(prev => ({ ...prev, [postId]: saved }))
  }

  const getRelativeTime = (dateStr) => {
    try {
      const date = new Date(dateStr)
      const currentLocale = i18n.language === 'ru' ? ru : enUS
      return formatDistanceToNow(date, { addSuffix: true, locale: currentLocale })
    } catch (e) {
      return ''
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16 animate-in fade-in duration-500">
      
      {/* 1. WIP Stories horizontal banner (Always Visible at the Top) */}
      <div className="glass-card overflow-visible p-2 border-white/5 rounded-3xl w-full">
        <StoriesBanner
          currentUser={currentUser}
          avatarUrl={avatarUrl}
          nickname={nickname}
          isPro={isPro}
          onViewProfile={onViewProfile}
        />
      </div>

      {/* Tab Switcher & Unified Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
        <AnimatedPillGroup
          value={activeSubTab}
          onChange={setActiveSubTab}
          options={[
            { value: 'foryou',  icon: <Sparkles className="w-3.5 h-3.5" />, label: t('for_you', 'For You') },
            { value: 'explore', icon: <Compass  className="w-3.5 h-3.5" />, label: t('explore') },
          ]}
          containerClassName={TAB_CONTAINER}
          buttonClassName={TAB_BUTTON}
        />

        {/* Explore Sub-Filters (Only rendered under Explore sub-tab) */}
        {activeSubTab === 'explore' && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <AnimatedPillGroup
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'recent',  icon: <Calendar className="w-3.5 h-3.5" />, label: t('recent') },
                { value: 'popular', icon: <Flame    className="w-3.5 h-3.5" />, label: t('popular') },
              ]}
              containerClassName={`${TAB_CONTAINER} w-full sm:w-auto`}
              buttonClassName={`${TAB_BUTTON} flex-1 sm:flex-none`}
            />
          </div>
        )}
      </div>

      {/* 2. SUB-TAB CONTENT PANEL */}

      {/* Tab A: For You Feed */}
      {activeSubTab === 'foryou' && (
        loading ? (
          <div className="space-y-6 w-full">
            {[1, 2].map((n) => (
              <div key={n} className="glass-card p-6 border-white/5 rounded-3xl animate-pulse space-y-4 w-full">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/5 rounded-full"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-white/5 rounded w-1/4"></div>
                    <div className="h-3 bg-white/5 rounded w-1/6"></div>
                  </div>
                </div>
                <div className="w-full h-80 bg-[#181622] rounded-2xl"></div>
              </div>
            ))}
          </div>
        ) : (forYouPosts.length > 0 || recommended.length > 0) ? (
          
          <div className="max-w-2xl mx-auto w-full space-y-6 animate-in fade-in duration-500">
            {/* Recommended Creators horizontal scroll */}
            {recommended.length > 0 && (
              <div className="space-y-3 w-full bg-white/[0.01] border border-white/5 rounded-3xl p-6 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest">
                      {t('popular_creators', 'Creators you might like')}
                    </h4>
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10">
                  {recommended.map((creator) => {
                    const isFollowing = followingMap[creator.id]
                    return (
                      <div key={creator.id} className="glass-card p-4 border-white/5 rounded-2xl flex flex-col items-center justify-between hover:border-purple-500/10 transition-all duration-300 w-40 shrink-0 text-center space-y-3">
                        <div className="cursor-pointer" onClick={() => onViewProfile?.(creator.id)}>
                          <ProfileAvatar 
                            avatarUrl={creator.avatar_url} 
                            workCount={creator.finished_work_count ?? 0} 
                            size="md" 
                            isPro={creator.isPro}
                            avatarFrame={creator.avatar_frame}
                          />
                        </div>
                        <div className="space-y-0.5 min-w-0 w-full">
                          <span className="text-xs font-bold text-white flex items-center justify-center gap-1 min-w-0 cursor-pointer" onClick={() => onViewProfile?.(creator.id)}>
                            <span className="truncate max-w-[100px]" style={getNicknameStyle(creator.nickname_color)}>
                              {creator.nickname}
                            </span>
                            {creator.is_verified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 shrink-0" />
                            )}
                          </span>
                          <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider truncate">
                            {(creator.specialization ? t(creator.specialization) : t('painter'))}
                          </p>
                        </div>
                        <button
                          onClick={() => handleFollowRecommended(creator.id)}
                          className={`w-full py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 active:scale-95 ${
                            isFollowing 
                              ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400' 
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                        >
                          {isFollowing ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                          <span>{isFollowing ? t('following', 'Following') : t('follow', 'Follow')}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {forYouPosts.map((post) => {
              const author = post.profiles || {}
              const currentPosts = forYouPosts
              return (
                <div key={post.id} className="glass-card p-6 border-white/5 rounded-3xl hover:border-purple-500/10 transition-all duration-300 relative group overflow-hidden w-full">
                  
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div 
                      onClick={() => onViewProfile?.(author.id)}
                      className="flex items-center gap-3 cursor-pointer group/author"
                    >
                      <ProfileAvatar 
                        avatarUrl={author.avatar_url} 
                        workCount={author.finished_work_count ?? 0} 
                        size="md" 
                        isPro={author.isPro}
                        avatarFrame={author.avatar_frame}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span 
                            className="text-sm font-bold text-white group-hover/author:text-purple-400 transition-colors flex items-center gap-1.5"
                          >
                            <span style={getNicknameStyle(author.nickname_color)}>
                              {author.nickname || 'Unknown Artist'}
                            </span>
                            {author.is_verified && (
                              <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                            )}
                            {author.isPro && (
                              <span className="pro-badge">
                                <Gem className="pro-badge-icon" />
                                <span className="pro-badge-text">Pro</span>
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                          {(author.specialization ? t(author.specialization) : t('painter'))} • {getRelativeTime(post.created_at)}
                        </p>
                      </div>
                    </div>

                    {post.category && (
                      <span className="px-2.5 py-1 bg-purple-600/10 border border-purple-500/20 text-[9px] font-black text-purple-400 rounded-lg uppercase tracking-wider text-right">
                        {t(`cat_${post.category.toLowerCase()}`)}
                      </span>
                    )}
                  </div>

                  {/* Body Text */}
                  <div className="mb-4 space-y-1">
                    <h3 className="text-base font-bold text-white tracking-tight">{post.title}</h3>
                    {post.description && (
                      <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">{post.description === 'New upload' ? t('new_upload_desc', 'New upload') : post.description}</p>
                    )}
                  </div>

                  {/* Main Work image Cover */}
                  {(() => {
                    const hidden = post.is_nsfw && !revealedNsfw[post.id]
                    return (
                  <div
                    onClick={() => { if (hidden) { toggleNsfwReveal(post.id); return } onOpenPost?.(post.id, post, currentPosts, currentPosts.indexOf(post)) }}
                    className="w-full rounded-2xl overflow-hidden cursor-pointer bg-[#0f0e16] border border-white/5 relative group/img mb-4"
                  >
                    <SmartImage
                      src={post.image_url}
                      alt={post.title}
                      width={1200}
                      srcWidths={[400, 800, 1200]}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 720px"
                      fit="natural"
                      className={hidden ? 'blur-2xl' : ''}
                    />
                    {hidden ? (
                      <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 text-center px-6">
                        <EyeOff className="w-7 h-7 text-white/80" />
                        <span className="text-xs font-bold text-white/90">{t('nsfw_hidden_title')}</span>
                        <span className="text-[11px] text-white/60">{t('nsfw_tap_reveal')}</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-6">
                        <span className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-950/40">
                          {t('view_full')}
                        </span>
                      </div>
                    )}
                  </div>
                    )
                  })()}

                  {/* Action Bar */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-4">
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={() => handleLike(post.id)}
                        className={`flex items-center gap-2 text-xs font-bold transition-all ${
                          likedMap[post.id] ? 'text-red-500 scale-105' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${likedMap[post.id] ? 'fill-red-500' : ''}`} />
                        <span>{post.likes_count ?? 0}</span>
                      </button>

                      <button 
                        onClick={() => onOpenPost?.(post.id, post, currentPosts, currentPosts.indexOf(post))}
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{post.comments_count ?? 0}</span>
                      </button>
                    </div>

                    <button 
                      onClick={() => handleBookmark(post.id)}
                      className={`flex items-center gap-2 text-xs font-bold transition-all ${
                        bookmarkedMap[post.id] ? 'text-purple-500 scale-105' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Bookmark className={`w-4 h-4 ${bookmarkedMap[post.id] ? 'fill-purple-500' : ''}`} />
                      <span>{bookmarkedMap[post.id] ? t('bookmark_saved', 'Saved') : t('save', 'Save')}</span>
                    </button>
                  </div>

                </div>
              )
            })}

            {/* Infinite-scroll sentinel */}
            {(activeSubTab === 'foryou' ? forYouHasMore : feedHasMore) && (
              <div ref={loadMoreRef} className="flex justify-center pt-4 h-12">
                {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-purple-400" />}
              </div>
            )}
          </div>
        ) : (
          // Empty State Follow Recommendations fallback
          <div className="space-y-8 animate-in fade-in duration-500 w-full">
            <div className="glass-card p-8 border-purple-500/10 rounded-3xl text-center space-y-4 max-w-xl mx-auto w-full">
              <div className="w-14 h-14 bg-purple-500/10 rounded-2xl border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                <Compass className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">{t('feed')}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                {t('no_posts_feed')}
              </p>
            </div>

            <div className="space-y-4 w-full">
              <div className="flex items-center gap-2 px-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                  {t('popular_creators')}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {recommended.map((creator) => {
                  const isFollowing = followingMap[creator.id]
                  return (
                    <div key={creator.id} className="glass-card p-6 border-white/5 rounded-3xl flex flex-col justify-between hover:border-purple-500/10 transition-all duration-300 w-full">
                      
                      <div className="flex items-center gap-4">
                        <ProfileAvatar 
                          avatarUrl={creator.avatar_url} 
                          workCount={creator.finished_work_count ?? 0} 
                          size="md" 
                          isPro={creator.isPro}
                          avatarFrame={creator.avatar_frame}
                        />
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="text-sm font-bold text-white flex items-center gap-1.5 min-w-0"
                            >
                              <span className="truncate max-w-[150px]" style={getNicknameStyle(creator.nickname_color)}>
                                {creator.nickname}
                              </span>
                              {creator.is_verified && (
                                <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                              )}
                              {creator.isPro && (
                                <span className="pro-badge">
                                  <Gem className="pro-badge-icon" />
                                  <span className="pro-badge-text">Pro</span>
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
                            {(creator.specialization ? t(creator.specialization) : t('painter'))}
                          </p>
                          {creator.bio && (
                            <p className="text-[11px] text-gray-400 leading-normal line-clamp-2 pr-2">
                              {creator.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-6">
                        <button
                          onClick={() => handleFollowRecommended(creator.id)}
                          className={`w-full py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isFollowing 
                              ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400' 
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                        >
                          {isFollowing ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>{t('following', 'Following')}</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              <span>{t('follow', 'Follow')}</span>
                            </>
                          )}
                        </button>
                      </div>

                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      )}

      {/* Tab B: Global Search & Explore Grid */}
      {activeSubTab === 'explore' && (
        <div className="space-y-6 w-full">
          
          {/* Search bar inside unified panel */}
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full bg-[#12111a] hover:bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-2xl pl-12 pr-6 py-4 text-sm text-white placeholder-gray-600 transition-all shadow-lg"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category scrolling slider — жидкая капсула скользит между категориями */}
          <AnimatedPillGroup
            value={selectedCategory}
            onChange={(cat) => { setSelectedCategory(cat); setSelectedTag('') }}
            options={categories.map(cat => ({
              value: cat,
              label: cat === 'All' ? t('filter_all') : t(`cat_${cat.toLowerCase()}`),
            }))}
            containerClassName="relative flex items-center gap-2 overflow-x-auto scrollbar-none w-full px-1 py-4 -my-3"
            buttonClassName="lg-pill flex-none flex items-center justify-center gap-1.5 font-black uppercase tracking-tighter text-xs whitespace-nowrap rounded-xl px-4 py-2"
          />

          {/* Active Tag indicator panel */}
          {selectedTag && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-bold self-start w-fit">
              <Tag className="w-3.5 h-3.5" />
              <span>#{selectedTag}</span>
              <button 
                onClick={() => setSelectedTag('')}
                className="hover:text-white ml-1 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Explore contents loading or Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 w-full">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : explorePaintings.length > 0 ? (
            
            <div className="space-y-8 w-full animate-in fade-in duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
                {explorePaintings.map((painting, index) => {
                  const author = painting.profiles || {}
                  const hidden = painting.is_nsfw && !revealedNsfw[painting.id]
                  return (
                    <div
                      key={painting.id}
                      onClick={() => { if (hidden) { toggleNsfwReveal(painting.id); return } onOpenPost?.(painting.id, painting, explorePaintings, index) }}
                      className="glass-card overflow-hidden rounded-2xl border-white/5 hover:border-purple-500/20 transition-all duration-500 hover:-translate-y-1.5 cursor-pointer group/card flex flex-col justify-between w-full"
                    >

                      {/* Visual media */}
                      <div className="w-full aspect-[4/3] overflow-hidden relative bg-[#0f0e16]">
                        <SmartImage
                          src={painting.image_url}
                          alt={painting.title}
                          width={600}
                          srcWidths={[300, 600]}
                          sizes="(max-width: 640px) 50vw, 360px"
                          className={`w-full h-full object-cover transition-transform duration-700 ease-out ${hidden ? 'blur-2xl scale-110' : 'group-hover/card:scale-105'}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0b11] via-transparent to-transparent opacity-60 group-hover/card:opacity-30 transition-opacity" />
                        {hidden && (
                          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1.5 text-center px-3">
                            <EyeOff className="w-6 h-6 text-white/80" />
                            <span className="text-[11px] font-bold text-white/90">{t('nsfw_hidden_title')}</span>
                          </div>
                        )}
                        <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-black text-white flex items-center gap-1.5 border border-white/5">
                          <Star className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
                          <span>{painting.likesCount || 0}</span>
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="p-4 space-y-3 bg-[#0d0c13]/90">
                        <div>
                          <h4 className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover/card:text-purple-400 transition-colors">
                            {painting.title}
                          </h4>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                            {painting.category ? t(`cat_${painting.category.toLowerCase()}`) : t('cat_digital')}
                          </p>
                        </div>

                        <div 
                          onClick={(e) => {
                            e.stopPropagation()
                            if (author.id) onViewProfile?.(author.id)
                          }}
                          className="flex items-center gap-2 border-t border-white/5 pt-3 group/author"
                        >
                          <ProfileAvatar 
                            avatarUrl={author.avatar_url} 
                            workCount={author.finished_work_count ?? 0} 
                            size="xs" 
                            isPro={author.isPro}
                            avatarFrame={author.avatar_frame}
                          />
                          <div className="flex items-center gap-1 min-w-0">
                            <span 
                              className="text-[11px] font-bold text-gray-400 group-hover/author:text-white transition-colors flex items-center gap-1.5 min-w-0"
                            >
                              <span className="truncate max-w-[100px]" style={getNicknameStyle(author.nickname_color)}>
                                {author.nickname || 'Unknown Artist'}
                              </span>
                              {author.is_verified && (
                                <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                              )}
                              {author.isPro && (
                                <span className="pro-badge">
                                  <Gem className="pro-badge-icon" />
                                  <span className="pro-badge-text">Pro</span>
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>
                  )
                })}
              </div>

              {/* Infinite-scroll sentinel */}
              {exploreHasMore && (
                <div ref={loadMoreRef} className="flex justify-center pt-4 h-12">
                  {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-purple-400" />}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-4 w-full">
              <SlidersHorizontal className="w-10 h-10 text-gray-500 mx-auto" />
              <h3 className="text-base font-bold text-white">{t('empty_explore')}</h3>
              <p className="text-xs text-gray-500">
                Try adjusting your search query or categories to discover more masterpieces.
              </p>
            </div>
          )}

        </div>
      )}

    </div>
  )
}
