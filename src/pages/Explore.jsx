import { useState, useEffect } from 'react'
import { Search, SlidersHorizontal, Grid, Star, Tag, X, Flame, Calendar, BadgeCheck, Loader2, Sparkles, Heart, MessageSquare, Bookmark, Compass, UserPlus, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchExplorePaintings, fetchFeedPaintings, togglePostLike, toggleBookmark, toggleFollow, isBookmarked } from '../lib/supabase'
import { StoriesBanner } from '../components/StoriesBanner'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { ProfileAvatar } from '../components/ProfileAvatar'

export function Explore({ currentUser, nickname, avatarUrl, onOpenPost, onViewProfile }) {
  const { t, i18n } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState('feed') // 'feed' (subscriptions) or 'explore' (global search)
  
  // Loading states
  const [loading, setLoading] = useState(true)
  
  // Feed state variables
  const [feedPosts, setFeedPosts] = useState([])
  const [recommended, setRecommended] = useState([])
  const [likedMap, setLikedMap] = useState({})
  const [bookmarkedMap, setBookmarkedMap] = useState({})
  const [followingMap, setFollowingMap] = useState({})

  // Explore search & filter state variables
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedTag, setSelectedTag] = useState('')
  const [sortBy, setSortBy] = useState('recent') // 'recent' or 'popular'
  const [explorePaintings, setExplorePaintings] = useState([])

  const categories = [
    'All',
    'Digital Art',
    'Oil/Watercolor Painting',
    'Photography',
    'Sculpture',
    'Design',
    '3D',
    'Sketching'
  ]

  // ----------------------------------------------------
  // Loader: Feed (Subscriptions)
  // ----------------------------------------------------
  const loadFeed = async () => {
    if (!currentUser || activeSubTab !== 'feed') return
    setLoading(true)
    try {
      const feedData = await fetchFeedPaintings(currentUser.id)
      
      // Check if we received recommended creators fallback
      if (feedData.length > 0 && feedData[0].recommendedCreators) {
        setRecommended(feedData[0].recommendedCreators)
        if (feedData[0].id === 'empty-fallback') {
          setFeedPosts([])
        } else {
          setFeedPosts(feedData)
        }
      } else {
        setFeedPosts(feedData)
        setRecommended([])
      }
      
      // Pre-fetch likes and bookmark statuses for loaded posts
      if (feedData.length > 0 && feedData[0].id !== 'empty-fallback') {
        const likes = {}
        const bookmarks = {}
        
        for (const post of feedData) {
          const { data: likeRecord } = await supabase
            .from('post_likes')
            .select('id')
            .eq('painting_id', post.id)
            .eq('user_id', currentUser.id)
            .maybeSingle()
          
          likes[post.id] = !!likeRecord

          const bookmarked = await isBookmarked(currentUser.id, post.id)
          bookmarks[post.id] = bookmarked
        }

        setLikedMap(likes)
        setBookmarkedMap(bookmarks)
      }
    } catch (err) {
      console.error("Error loading feed:", err)
    } finally {
      setLoading(false)
    }
  }

  // ----------------------------------------------------
  // Loader: Explore (Global Search & Filters)
  // ----------------------------------------------------
  const loadExplore = async () => {
    if (activeSubTab !== 'explore') return
    setLoading(true)
    try {
      const data = await fetchExplorePaintings({
        searchQuery,
        category: selectedCategory,
        onlyFinished: true, // Always filter by finished works
        tag: selectedTag,
        sort: sortBy
      })
      setExplorePaintings(data)
    } catch (err) {
      console.error("Error loading explore paintings:", err)
    } finally {
      setLoading(false)
    }
  }

  // Reload active tab data when active tab or filters change
  useEffect(() => {
    if (activeSubTab === 'feed') {
      loadFeed()
    } else {
      const delayDebounce = setTimeout(() => {
        loadExplore()
      }, 400) // 400ms debounce
      return () => clearTimeout(delayDebounce)
    }
  }, [activeSubTab, searchQuery, selectedCategory, selectedTag, sortBy, currentUser])

  // Recommended creator follow action
  const handleFollowRecommended = async (targetId) => {
    if (!currentUser) return
    const followed = await toggleFollow(currentUser.id, targetId)
    setFollowingMap(prev => ({ ...prev, [targetId]: followed }))
    
    setTimeout(() => {
      loadFeed()
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
      <div className="glass-card p-2 border-white/5 rounded-3xl w-full">
        <StoriesBanner 
          currentUser={currentUser}
          avatarUrl={avatarUrl}
          nickname={nickname}
        />
      </div>

      {/* Tab Switcher & Unified Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0d0c13]/40 p-4 rounded-3xl border border-white/5 w-full">
        <div className="flex bg-[#12111a] p-1.5 rounded-2xl border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveSubTab('feed')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'feed' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('feed')}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('explore')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'explore' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{t('explore')}</span>
          </button>
        </div>

        {/* Explore Sub-Filters (Only rendered under Explore sub-tab) */}
        {activeSubTab === 'explore' && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Sorting controls */}
            <div className="flex bg-[#12111a] p-1 rounded-xl border border-white/5 w-full sm:w-auto">
              <button
                onClick={() => setSortBy('recent')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                  sortBy === 'recent' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3 h-3" />
                <span>{t('recent')}</span>
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                  sortBy === 'popular' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Flame className="w-3 h-3" />
                <span>{t('popular')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. SUB-TAB CONTENT PANEL */}
      
      {/* Tab A: Chronological subscription Feed */}
      {activeSubTab === 'feed' && (
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
        ) : feedPosts.length > 0 ? (
          
          <div className="space-y-6 w-full">
            {feedPosts.map((post) => {
              const author = post.profiles || {}
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
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white group-hover/author:text-purple-400 transition-colors">
                            {author.nickname || 'Unknown Artist'}
                          </span>
                          {author.is_verified && (
                            <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-white text-[9px] font-black">
                              ✓
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                          {author.specialization || 'Painter'} • {getRelativeTime(post.created_at)}
                        </p>
                      </div>
                    </div>

                    {post.category && (
                      <span className="px-2.5 py-1 bg-purple-600/10 border border-purple-500/20 text-[9px] font-black text-purple-400 rounded-lg uppercase tracking-wider text-right">
                        {post.category}
                      </span>
                    )}
                  </div>

                  {/* Body Text */}
                  <div className="mb-4 space-y-1">
                    <h3 className="text-base font-bold text-white tracking-tight">{post.title}</h3>
                    {post.description && (
                      <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">{post.description}</p>
                    )}
                  </div>

                  {/* Main Work image Cover */}
                  <div 
                    onClick={() => onOpenPost?.(post.id, post, feedPosts, feedPosts.indexOf(post))}
                    className="w-full aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer bg-[#0f0e16] border border-white/5 relative group/img mb-4"
                  >
                    <img 
                      src={post.image_url} 
                      alt={post.title} 
                      className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-6">
                      <span className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-950/40">
                        {t('view_full')}
                      </span>
                    </div>
                  </div>

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
                        <span>{likedMap[post.id] ? 'Liked' : 'Like'}</span>
                      </button>

                      <button 
                        onClick={() => onOpenPost?.(post.id, post, feedPosts, feedPosts.indexOf(post))}
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Comment</span>
                      </button>
                    </div>

                    <button 
                      onClick={() => handleBookmark(post.id)}
                      className={`flex items-center gap-2 text-xs font-bold transition-all ${
                        bookmarkedMap[post.id] ? 'text-purple-500 scale-105' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Bookmark className={`w-4 h-4 ${bookmarkedMap[post.id] ? 'fill-purple-500' : ''}`} />
                      <span>{bookmarkedMap[post.id] ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>

                </div>
              )
            })}
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
                      
                      <div className="flex items-start gap-4">
                        <ProfileAvatar 
                          avatarUrl={creator.avatar_url} 
                          workCount={creator.finished_work_count ?? 0} 
                          size="md" 
                        />
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white truncate">{creator.nickname}</span>
                            {creator.is_verified && (
                              <div className="w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[8px] font-black flex-shrink-0">
                                ✓
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
                            {creator.specialization || 'Painter'}
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
                              <span>Following</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              <span>Follow</span>
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

          {/* Category scrolling slider */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none w-full">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat
              const displayLabel = cat === 'All' ? t('filter_all') : cat
              return (
                <button
                  key={cat}
                  onClick={() => { setSelectedCategory(cat); setSelectedTag(''); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold tracking-tight whitespace-nowrap transition-all duration-300 ${
                    isSelected 
                      ? 'bg-purple-600/10 text-purple-400 border border-purple-500/30' 
                      : 'bg-[#12111a] text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {displayLabel}
                </button>
              )
            })}
          </div>

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
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 w-full">
              {explorePaintings.map((painting, index) => {
                const author = painting.profiles || {}
                return (
                  <div 
                    key={painting.id}
                    onClick={() => onOpenPost?.(painting.id, painting, explorePaintings, index)}
                    className="glass-card overflow-hidden rounded-2xl border-white/5 hover:border-purple-500/20 transition-all duration-500 hover:-translate-y-1.5 cursor-pointer group/card flex flex-col justify-between w-full"
                  >
                    
                    {/* Visual media */}
                    <div className="w-full aspect-[4/3] overflow-hidden relative bg-[#0f0e16]">
                      <img 
                        src={painting.image_url} 
                        alt={painting.title}
                        className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-700 ease-out" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0c0b11] via-transparent to-transparent opacity-60 group-hover/card:opacity-30 transition-opacity" />
                      
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
                          {painting.category || 'Digital Art'}
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
                        />
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[11px] font-bold text-gray-400 group-hover/author:text-white transition-colors truncate max-w-[120px]">
                            {author.nickname || 'Unknown Artist'}
                          </span>
                          {author.is_verified && (
                            <div className="w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[7px] font-black flex-shrink-0">
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                )
              })}
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
