import { useState, useEffect } from 'react'
import { Hash, Loader2, BookmarkPlus, BookmarkCheck, LayoutGrid, Heart } from 'lucide-react'
import { fetchPaintingsByTag, toggleTagFollow, checkTagFollowStatus } from '../lib/supabase'
import { useTranslation } from 'react-i18next'

export function TagPage({ tagName, currentUser, onOpenPost, onBack }) {
  const { t } = useTranslation()
  const [paintings, setPaintings] = useState([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  useEffect(() => {
    if (!tagName) return
    let mounted = true
    
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchPaintingsByTag(tagName, currentUser?.id)
        if (mounted) setPaintings(data || [])
      } catch (err) {
        console.error("Failed to load tag paintings:", err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    
    const checkFollow = async () => {
      if (!currentUser?.id) return
      const status = await checkTagFollowStatus(currentUser.id, tagName)
      if (mounted) setIsFollowing(status)
    }

    load()
    checkFollow()

    return () => { mounted = false }
  }, [tagName, currentUser?.id])

  const handleToggleFollow = async () => {
    if (!currentUser?.id || isToggling) return
    setIsToggling(true)
    try {
      const newStatus = await toggleTagFollow(currentUser.id, tagName)
      setIsFollowing(newStatus)
    } catch (err) {
      console.error(err)
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="glass-card p-6 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="flex items-center gap-5 sm:gap-6 z-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-purple-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xl">
            <Hash className="w-8 h-8 sm:w-10 sm:h-10 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter lowercase">
              {tagName}
            </h1>
            <p className="text-gray-400 text-sm font-medium mt-1">
              {paintings.length} {paintings.length === 1 ? t('post', 'post') : t('posts', 'posts')}
            </p>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto z-10">
          <button 
            onClick={onBack}
            className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all shadow-lg text-sm uppercase tracking-widest whitespace-nowrap"
          >
            {t('back', 'Back')}
          </button>
          
          {currentUser && (
            <button 
              onClick={handleToggleFollow}
              disabled={isToggling}
              className={`flex-1 md:flex-none px-6 py-3 flex items-center justify-center gap-2 font-black rounded-xl transition-all shadow-lg text-sm uppercase tracking-widest whitespace-nowrap disabled:opacity-50 ${
                isFollowing 
                  ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30' 
                  : 'bg-purple-600 text-white hover:bg-purple-500 shadow-purple-900/40'
              }`}
            >
              {isToggling ? <Loader2 className="w-4 h-4 animate-spin" /> : isFollowing ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
              {isFollowing ? t('following_tag', 'Following') : t('follow_tag', 'Follow')}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-4 text-purple-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest animate-pulse">{t('loading')}</span>
        </div>
      ) : paintings.length === 0 ? (
        <div className="glass-card h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
          <LayoutGrid className="w-12 h-12 opacity-20" />
          <p className="font-medium">{t('no_posts_found', 'No posts found')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {paintings.map((painting, index) => (
            <div 
              key={painting.id} 
              onClick={() => onOpenPost(painting.id, painting, paintings, index, painting.profiles)}
              className="glass-card group cursor-pointer overflow-hidden hover:-translate-y-1 transition-all duration-300 border-white/5 hover:border-purple-500/30 shadow-xl h-full flex flex-col"
            >
              <div className="aspect-[4/3] overflow-hidden relative">
                {painting.media_type === 'video' ? (
                  <video src={painting.image_url} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={painting.image_url} alt={painting.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                )}
                
                {painting.media_type === 'carousel' && (
                   <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-1.5 py-1 rounded flex gap-0.5 pointer-events-none">
                     <div className="w-1 h-1 bg-white rounded-full" />
                     <div className="w-1 h-1 bg-white/50 rounded-full" />
                   </div>
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                  <div className="flex items-center gap-4 text-white">
                    <span className="flex items-center gap-1.5 font-bold text-sm">
                      <Heart className="w-4 h-4 fill-white" /> {painting.likes_count || 0}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-black text-white text-base line-clamp-1 group-hover:text-purple-400 transition-colors uppercase">{painting.title}</h3>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">
                  {painting.profiles?.nickname || t('anonymous')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
