import { useState, useEffect } from 'react'
import { Search, Bookmark, User, Loader2, Palette, Shapes, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchBookmarks } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'

export function Bookmarks({ onOpenPost }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookmarks()
  }, [])

  const loadBookmarks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const data = await fetchBookmarks(user.id)
        setBookmarks(data || [])
      }
    } catch (err) {
      console.error("Error loading bookmarks:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredBookmarks = bookmarks.filter(p => {
    const titleMatch = p.title?.toLowerCase().includes(search.toLowerCase())
    const authorMatch = p.user?.nickname?.toLowerCase().includes(search.toLowerCase())
    const descMatch = p.description?.toLowerCase().includes(search.toLowerCase())
    return titleMatch || authorMatch || descMatch
  })

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8 md:space-y-12 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3 flex items-center gap-3">
            <Bookmark className="w-8 h-8 sm:w-10 sm:h-10 text-purple-500 fill-purple-500/20" />
            {t('bookmarks', 'Bookmarks')}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">Your curated gallery of inspiration.</p>
        </div>
        
        {/* Search */}
        {bookmarks.length > 0 && (
          <div className="relative group flex-1 sm:flex-none w-full lg:w-80">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
            <input 
              type="text" 
              placeholder={t('search', 'Search...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-14 pl-14 pr-6 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white font-medium"
            />
          </div>
        )}
      </div>

      {/* Grid */}
      {filteredBookmarks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {filteredBookmarks.map((painting, index) => (
            <div 
              key={painting.id} 
              onClick={() => onOpenPost?.(painting.id, painting, filteredBookmarks, index, painting.user)}
              className="glass-card group relative overflow-hidden flex flex-col h-full hover:-translate-y-2 transition-all duration-500 border-white/5 hover:border-purple-500/30 shadow-2xl cursor-pointer"
            >
              {/* Image Preview */}
              <div className="aspect-[4/3] overflow-hidden relative">
                <img 
                  src={painting.image_url} 
                  alt={painting.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4">
                  <span className="inline-block px-2.5 py-1 bg-black/60 backdrop-blur-xl border border-white/10 text-[9px] font-black rounded-lg uppercase tracking-wider text-purple-400">
                    {painting.category || 'Artwork'}
                  </span>
                </div>
              </div>

              {/* Artwork Info */}
              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight group-hover:text-purple-400 transition-colors uppercase truncate">
                    {painting.title}
                  </h3>
                  <p className="text-xs font-medium text-gray-500 line-clamp-2 mt-1 leading-relaxed">
                    {painting.description || 'No description provided.'}
                  </p>
                </div>

                {/* Author Profile */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
                  <ProfileAvatar 
                    avatarUrl={painting.user?.avatar_url} 
                    workCount={painting.user?.finished_work_count ?? 0} 
                    size="xs" 
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-gray-300 truncate">
                      {painting.user?.nickname || 'Unknown Artist'}
                    </span>
                    {painting.user?.specialization && (
                      <span className="flex items-center gap-1 text-purple-500 text-[8px] font-black uppercase tracking-wider mt-0.5">
                        {painting.user.specialization === 'painter' ? <Palette className="w-2 h-2" /> : 
                         painting.user.specialization === 'photographer' ? <Camera className="w-2 h-2" /> : 
                         <Shapes className="w-2 h-2" />}
                        {t(painting.user.specialization)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white/[0.01] border border-white/5 rounded-3xl">
          <div className="w-16 h-16 bg-white/5 rounded-2.5rem flex items-center justify-center mx-auto mb-6 border border-white/5">
            <Bookmark className="w-7 h-7 text-gray-600" />
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">No bookmarks found</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {search 
              ? "We couldn't find any saved artworks matching your query." 
              : "Artworks you save will appear here. Start exploring the community to find inspiration!"}
          </p>
        </div>
      )}
    </div>
  )
}
