import { useState, useEffect } from 'react'
import { Search, SlidersHorizontal, Grid, Star, Tag, X, Flame, Calendar, BadgeCheck, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchExplorePaintings } from '../lib/supabase'

export function Explore({ onOpenPost, onViewProfile }) {
  const { t } = useTranslation()
  const [paintings, setPaintings] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [onlyFinished, setOnlyFinished] = useState(false)
  const [selectedTag, setSelectedTag] = useState('')
  const [sortBy, setSortBy] = useState('recent') // 'recent' or 'popular'

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

  const loadExplore = async () => {
    setLoading(true)
    const data = await fetchExplorePaintings({
      searchQuery,
      category: selectedCategory,
      onlyFinished,
      tag: selectedTag,
      sort: sortBy
    })
    setPaintings(data)
    setLoading(false)
  }

  // Reload when filters change (except typing search immediately to avoid thrashing, we can debounce it or let the search button / trigger reload)
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadExplore()
    }, 400) // 400ms debounce on all filters including typing search!
    
    return () => clearTimeout(delayDebounce)
  }, [searchQuery, selectedCategory, onlyFinished, selectedTag, sortBy])

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-500">
      
      {/* Search and Filters Header */}
      <div className="space-y-6">
        
        {/* Search input with premium styling */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full bg-[#12111a] hover:bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-2xl pl-12 pr-6 py-4 text-sm text-white placeholder-gray-600 transition-all shadow-lg shadow-black/20"
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

          {/* Sort selection dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2">
              {t('sort')}:
            </span>
            <div className="flex bg-[#12111a] p-1 rounded-2xl border border-white/5">
              <button
                onClick={() => setSortBy('recent')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  sortBy === 'recent' 
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{t('recent')}</span>
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  sortBy === 'popular' 
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{t('popular')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Scroll Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
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

        {/* Sub-Filters: Only Finished Toggle & Active Tag Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0c0b11]/30 p-4 rounded-2xl border border-white/5">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input 
                type="checkbox"
                checked={onlyFinished}
                onChange={(e) => setOnlyFinished(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-all duration-300 ${onlyFinished ? 'bg-purple-600' : 'bg-white/10'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all duration-300 ${onlyFinished ? 'left-4.75' : 'left-0.75'}`} style={{ top: '3px' }} />
              </div>
            </div>
            <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors uppercase tracking-widest">
              {t('only_finished')}
            </span>
          </label>

          {/* Active Tag filter indicator */}
          {selectedTag && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/10 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-bold">
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
        </div>

      </div>

      {/* Grid Content section */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        </div>
      ) : paintings.length > 0 ? (
        
        // Premium Masonry Adaptive Grid
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {paintings.map((painting, index) => {
            const author = painting.profiles || {}
            return (
              <div 
                key={painting.id}
                onClick={() => onOpenPost?.(painting.id, painting, paintings, index)}
                className="glass-card overflow-hidden rounded-2xl border-white/5 hover:border-purple-500/20 transition-all duration-500 hover:-translate-y-1.5 cursor-pointer group/card flex flex-col justify-between"
              >
                {/* Visual Cover */}
                <div className="w-full aspect-[4/3] overflow-hidden relative bg-[#0f0e16]">
                  <img 
                    src={painting.image_url} 
                    alt={painting.title}
                    className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-700 ease-out" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0b11] via-transparent to-transparent opacity-60 group-hover/card:opacity-30 transition-opacity" />
                  
                  {/* Hearts count badge */}
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-black text-white flex items-center gap-1.5 border border-white/5">
                    <Star className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
                    <span>{painting.likesCount || 0}</span>
                  </div>
                </div>

                {/* Footer details */}
                <div className="p-4 space-y-3 bg-[#0d0c13]/90">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover/card:text-purple-400 transition-colors">
                      {painting.title}
                    </h4>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      {painting.category || 'Digital Art'}
                    </p>
                  </div>

                  {/* Profile info tiny banner */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation()
                      if (author.id) onViewProfile?.(author.id)
                    }}
                    className="flex items-center gap-2 border-t border-white/5 pt-3 group/author"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-purple-900/10 border border-white/10 flex-shrink-0">
                      <img 
                        src={author.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                        alt={author.nickname} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-gray-400 group-hover/author:text-white transition-colors truncate max-w-[120px]">
                        {author.nickname || 'Unknown Artist'}
                      </span>
                      {author.is_verified && (
                        <div className="w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-white text-[7px] font-black flex-shrink-0">
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
        // Empty state
        <div className="text-center py-20 bg-[#12111a]/20 border border-white/5 rounded-3xl p-8 max-w-md mx-auto space-y-4">
          <SlidersHorizontal className="w-10 h-10 text-gray-500 mx-auto" />
          <h3 className="text-base font-bold text-white">{t('empty_explore')}</h3>
          <p className="text-xs text-gray-500">
            Try adjusting your search keywords, category selectors or tags to discover more masterpieces.
          </p>
        </div>
      )}
    </div>
  )
}
