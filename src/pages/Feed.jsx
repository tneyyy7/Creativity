import { useState, useEffect } from 'react'
import { Heart, MessageSquare, Bookmark, Compass, Users, Sparkles, UserPlus, Check, MessageCircle, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchFeedPaintings, togglePostLike, toggleBookmark, toggleFollow, isBookmarked, checkFollowStatus } from '../lib/supabase'
import { StoriesBanner } from '../components/StoriesBanner'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'

export function Feed({ currentUser, nickname, avatarUrl, onOpenPost, onNavigate }) {
  const { t, i18n } = useTranslation()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [recommended, setRecommended] = useState([])
  const [likedMap, setLikedMap] = useState({})
  const [bookmarkedMap, setBookmarkedMap] = useState({})
  const [followingMap, setFollowingMap] = useState({})

  const loadFeed = async () => {
    if (!currentUser) return
    setLoading(true)
    const feedData = await fetchFeedPaintings(currentUser.id)
    
    // Check if we received recommended creators fallback
    if (feedData.length > 0 && feedData[0].recommendedCreators) {
      setRecommended(feedData[0].recommendedCreators)
      if (feedData[0].id === 'empty-fallback') {
        setPosts([])
      } else {
        setPosts(feedData)
      }
    } else {
      setPosts(feedData)
      setRecommended([])
    }
    
    // Pre-fetch likes and bookmark statuses for loaded posts
    if (feedData.length > 0 && feedData[0].id !== 'empty-fallback') {
      const likes = {}
      const bookmarks = {}
      
      for (const post of feedData) {
        // Check if current user liked
        const { data: likeRecord } = await supabase
          .from('post_likes')
          .select('id')
          .eq('painting_id', post.id)
          .eq('user_id', currentUser.id)
          .maybeSingle()
        
        likes[post.id] = !!likeRecord

        // Check bookmark
        const bookmarked = await isBookmarked(currentUser.id, post.id)
        bookmarks[post.id] = bookmarked
      }

      setLikedMap(likes)
      setBookmarkedMap(bookmarks)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadFeed()
  }, [currentUser])

  // Handle follow/unfollow for recommended creators
  const handleFollowRecommended = async (targetId) => {
    if (!currentUser) return
    const followed = await toggleFollow(currentUser.id, targetId)
    setFollowingMap(prev => ({ ...prev, [targetId]: followed }))
    
    // Set a timeout to reload feed so newly followed author's works load
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
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      
      {/* 1. WIP Stories Horizontal Banner */}
      <div className="glass-card p-2 border-white/5 rounded-3xl">
        <StoriesBanner 
          currentUser={currentUser}
          avatarUrl={avatarUrl}
          nickname={nickname}
        />
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div key={n} className="glass-card p-6 border-white/5 rounded-3xl animate-pulse space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/5 rounded-full"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-white/5 rounded w-1/4"></div>
                  <div className="h-3 bg-white/5 rounded w-1/6"></div>
                </div>
              </div>
              <div className="w-full h-80 bg-white/5 rounded-2xl"></div>
            </div>
          ))}
        </div>
      ) : posts.length > 0 ? (
        
        // 2. Stream of subscription posts
        <div className="space-y-6">
          {posts.map((post) => {
            const author = post.profiles || {}
            return (
              <div key={post.id} className="glass-card p-6 border-white/5 rounded-3xl hover:border-purple-500/10 transition-all duration-300 relative group overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div 
                    onClick={() => onNavigate?.('public_profile', author.id)}
                    className="flex items-center gap-3 cursor-pointer group/author"
                  >
                    <div className="w-11 h-11 rounded-full border border-white/5 overflow-hidden bg-purple-900/10">
                      <img 
                        src={author.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                        alt={author.nickname} 
                        className="w-full h-full object-cover"
                      />
                    </div>
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

                  {/* Category Badge */}
                  {post.category && (
                    <span className="px-2.5 py-1 bg-purple-600/10 border border-purple-500/20 text-[9px] font-black text-purple-400 rounded-lg uppercase tracking-wider">
                      {post.category}
                    </span>
                  )}
                </div>

                {/* Text Title & Description */}
                <div className="mb-4 space-y-1">
                  <h3 className="text-base font-bold text-white tracking-tight">{post.title}</h3>
                  {post.description && (
                    <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">{post.description}</p>
                  )}
                </div>

                {/* Main Media Visual Card */}
                <div 
                  onClick={() => onOpenPost?.(post.id, post, posts, posts.indexOf(post))}
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

                {/* Actions Footer Bar */}
                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                  <div className="flex items-center gap-6">
                    
                    {/* Likes */}
                    <button 
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-2 text-xs font-bold transition-all ${
                        likedMap[post.id] ? 'text-red-500 scale-105' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${likedMap[post.id] ? 'fill-red-500' : ''}`} />
                      <span>{likedMap[post.id] ? 'Liked' : 'Like'}</span>
                    </button>

                    {/* Comments trigger (opens modal) */}
                    <button 
                      onClick={() => onOpenPost?.(post.id, post, posts, posts.indexOf(post))}
                      className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Comment</span>
                    </button>
                  </div>

                  {/* Bookmark/Collection trigger */}
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
        
        // 3. Recommended Creators (Empty Feed State Fallback)
        <div className="space-y-8 animate-in fade-in duration-500">
          
          <div className="glass-card p-8 border-purple-500/10 rounded-3xl text-center space-y-4 max-w-xl mx-auto">
            <div className="w-14 h-14 bg-purple-500/10 rounded-2xl border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">{t('feed')}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t('no_posts_feed')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                {t('popular_creators')}
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recommended.map((creator) => {
                const isFollowing = followingMap[creator.id]
                return (
                  <div key={creator.id} className="glass-card p-6 border-white/5 rounded-3xl flex flex-col justify-between hover:border-purple-500/10 transition-all duration-300">
                    
                    {/* User profile layout inside Card */}
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-purple-900/10 flex-shrink-0">
                        <img 
                          src={creator.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                          alt={creator.nickname} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white">{creator.nickname}</span>
                          {creator.is_verified && (
                            <div className="w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[8px] font-black">
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

                    {/* Follow Action */}
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
      )}
    </div>
  )
}
