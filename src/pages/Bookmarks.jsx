import { useState, useEffect } from 'react'
import { Search, Bookmark, Folder, FolderPlus, ArrowLeft, Loader2, Palette, Shapes, Camera, Trash2, Plus, Gem, BadgeCheck, Box, PenTool } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchBookmarks, fetchUserCollections, createCollection } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { getNicknameStyle } from '../lib/nicknameStyle'
import { AnimatedPillGroup } from '../components/AnimatedPillGroup'
import SmartImage from '../components/SmartImage'
import { GlassModal, GlassModalHeader, glassInput, glassActionBase, glassActionPrimary } from '../components/GlassModal'

export function Bookmarks({ onOpenPost }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [bookmarks, setBookmarks] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState('bookmarks') // 'bookmarks' or 'collections'
  const [selectedCollection, setSelectedCollection] = useState(null) // selected collection object to inspect

  // Album creation states
  const [showAlbumCreator, setShowAlbumCreator] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [albumDesc, setAlbumDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const [bookmarksData, collectionsData] = await Promise.all([
          fetchBookmarks(user.id),
          fetchUserCollections(user.id)
        ])
        setBookmarks(bookmarksData || [])
        setCollections(collectionsData || [])
      }
    } catch (err) {
      console.error("Error loading bookmarks/collections data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateAlbum = async (e) => {
    e.preventDefault()
    if (!albumName.trim()) return

    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await createCollection(user.id, albumName.trim(), albumDesc.trim())
        setAlbumName('')
        setAlbumDesc('')
        setShowAlbumCreator(false)
        await loadData()
      }
    } catch (err) {
      console.error(err)
      alert("Error creating album")
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteAlbum = async (e, collectionId) => {
    e.stopPropagation()
    if (!confirm(t('delete_album_confirm'))) return

    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collectionId)

      if (error) throw error
      await loadData()
      if (selectedCollection?.id === collectionId) {
        setSelectedCollection(null)
      }
    } catch (err) {
      console.error("Error deleting collection:", err)
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
      
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3 flex items-center gap-3">
            <Bookmark className="w-8 h-8 sm:w-10 sm:h-10 text-purple-500 fill-purple-500/20" />
            {selectedCollection ? selectedCollection.name : t('bookmarks')}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">
            {selectedCollection ? (selectedCollection.description || t('collection_contents')) : t('bookmarks_subtitle')}
          </p>
        </div>

        {/* Right-side controls: action button + sub-tab selector grouped together so
            появление кнопки «Create» не сдвигает переключатель из правого угла.
            Переключатель — последний (правый) элемент, поэтому остаётся на месте. */}
        {!selectedCollection && (
          <div className="flex items-center gap-5 self-start lg:self-auto">
            {/* Кнопка «Create» рядом с переключателем — только когда альбомы УЖЕ есть.
                Если альбомов нет, остаётся только центральный блок с кнопкой ниже. */}
            {activeSubTab === 'collections' && collections.length > 0 && (
              <button
                onClick={() => setShowAlbumCreator(true)}
                className="lg-pill px-5 py-2.5 rounded-2xl text-xs font-bold text-white flex items-center gap-2"
                style={{
                  background: 'linear-gradient(160deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.55) 100%)',
                  border: '1px solid hsl(var(--primary) / 0.7)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 3px 12px hsl(var(--primary) / 0.4)',
                }}
              >
                <FolderPlus className="w-4 h-4" />
                <span>{t('create_collection')}</span>
              </button>
            )}

            <AnimatedPillGroup
              value={activeSubTab}
              onChange={setActiveSubTab}
              options={[
                { value: 'bookmarks', label: t('all_bookmarks') },
                { value: 'collections', label: t('my_collections') },
              ]}
              containerClassName="flex items-center gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-fit"
              buttonClassName="lg-pill px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter"
              pillVariant="glass"
            />
          </div>
        )}
      </div>

      {/* Drill down viewer for a specific album */}
      {selectedCollection ? (
        <div className="space-y-6">
          {/* Back button */}
          <button
            onClick={() => setSelectedCollection(null)}
            className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('back')}</span>
          </button>

          {/* Album works grid */}
          {selectedCollection.paintings && selectedCollection.paintings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {selectedCollection.paintings.map((painting, index) => (
                <div 
                  key={painting.id}
                  onClick={() => onOpenPost?.(painting.id, painting, selectedCollection.paintings, index)}
                  className="glass-card group relative overflow-hidden flex flex-col hover:-translate-y-2 transition-all duration-500 border-white/5 hover:border-purple-500/30 shadow-2xl cursor-pointer"
                >
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <SmartImage
                      src={painting.image_url}
                      alt={painting.title}
                      width={600}
                      srcWidths={[300, 600]}
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 300px"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute top-4 left-4">
                      <span className="inline-block px-2.5 py-1 bg-black/60 backdrop-blur-xl border border-white/10 text-[9px] font-black rounded-lg uppercase tracking-wider text-purple-400">
                        {painting.category ? t(`cat_${painting.category.toLowerCase()}`) : t('artwork')}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 sm:p-6">
                    <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-purple-400 transition-colors uppercase truncate">
                      {painting.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/[0.01] border border-white/5 rounded-3xl">
              <p className="text-gray-500 text-sm">{t('no_artworks_in_album')}</p>
            </div>
          )}
        </div>
      ) : activeSubTab === 'bookmarks' ? (
        
        // Tab A: Standard Bookmarks List
        filteredBookmarks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            {filteredBookmarks.map((painting, index) => (
              <div 
                key={painting.id} 
                onClick={() => onOpenPost?.(painting.id, painting, filteredBookmarks, index, painting.user)}
                className="glass-card group relative overflow-hidden flex flex-col h-full hover:-translate-y-2 transition-all duration-500 border-white/5 hover:border-purple-500/30 shadow-2xl cursor-pointer"
              >
                <div className="aspect-[4/3] overflow-hidden relative">
                  <img
                    src={painting.image_url}
                    alt={painting.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="inline-block px-2.5 py-1 bg-black/60 backdrop-blur-xl border border-white/10 text-[9px] font-black rounded-lg uppercase tracking-wider text-purple-400">
                      {painting.category ? t(`cat_${painting.category.toLowerCase()}`) : t('artwork')}
                    </span>
                  </div>
                </div>

                <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight group-hover:text-purple-400 transition-colors uppercase truncate">
                      {painting.title}
                    </h3>
                    <p className="text-xs font-medium text-gray-500 line-clamp-2 mt-1 leading-relaxed">
                      {painting.description === 'New upload' ? t('new_upload_desc', 'New upload') : (painting.description || t('no_description'))}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/[0.04]">
                    <ProfileAvatar 
                      avatarUrl={painting.user?.avatar_url} 
                      workCount={painting.user?.finished_work_count ?? 0} 
                      size="xs"
                      isPro={painting.user?.isPro}
                      avatarFrame={painting.user?.avatar_frame}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold truncate flex items-center gap-1.5 notranslate" translate="no" style={painting.user?.nickname_color ? { color: painting.user.nickname_color } : { color: '#d1d5db' }}>
                        {painting.user?.nickname || t('unknown_artist')}
                        {painting.user?.is_verified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                        )}
                        {painting.user?.isPro && (
                          <span className="pro-badge">
                            <Gem className="pro-badge-icon" />
                            <span className="pro-badge-text">Pro</span>
                          </span>
                        )}
                      </span>
                      {painting.user?.specialization && (
                        <span className="flex items-center gap-1 text-purple-500 text-[8px] font-black uppercase tracking-wider mt-0.5">
                          {painting.user.specialization === 'painter' ? <Palette className="w-2 h-2" /> : 
                           painting.user.specialization === 'photographer' ? <Camera className="w-2 h-2" /> : 
                           painting.user.specialization === '3D' ? <Box className="w-2 h-2" /> : 
                           painting.user.specialization === 'designer' ? <PenTool className="w-2 h-2" /> : 
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
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5">
              <Bookmark className="w-7 h-7 text-gray-600" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2">{t('no_bookmarks_title')}</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              {t('no_bookmarks_desc')}
            </p>
          </div>
        )
      ) : (
        
        // Tab B: Custom Collections/Albums Grid
        collections.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {collections.map((coll) => {
              const coverImg = coll.paintings?.[0]?.image_url
              return (
                <div
                  key={coll.id}
                  onClick={() => setSelectedCollection(coll)}
                  className="glass-card overflow-hidden border-white/5 hover:border-purple-500/20 transition-all duration-300 hover:-translate-y-1.5 cursor-pointer group/folder relative flex flex-col justify-between min-h-[220px]"
                >
                  {/* Folder graphical thumbnail panel */}
                  <div className="w-full aspect-[16/10] overflow-hidden bg-[#0d0c13] relative border-b border-white/5 flex items-center justify-center">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={coll.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover/folder:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <Folder className="w-12 h-12 text-gray-700 group-hover/folder:scale-110 transition-transform" />
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover/folder:bg-black/20 transition-colors" />
                    
                    {/* Size Badge */}
                    <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/80 rounded-md text-[9px] font-bold text-gray-400">
                      {coll.paintings?.length || 0} {t('items')}
                    </div>
                  </div>

                  {/* Folder Text Details */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white tracking-tight truncate uppercase leading-none mb-1 group-hover/folder:text-purple-400 transition-colors">
                        {coll.name}
                      </h4>
                      <p className="text-[10px] text-gray-500 font-bold tracking-tight truncate">
                        {coll.description || t('curated_folder')}
                      </p>
                    </div>

                    <button
                      onClick={(e) => handleDeleteAlbum(e, coll.id)}
                      className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/10 text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-20 bg-white/[0.01] border border-white/5 rounded-3xl p-8 max-w-sm mx-auto space-y-4">
            <Folder className="w-12 h-12 text-gray-600 mx-auto" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t('no_collections_yet')}</h3>
            <button
              onClick={() => setShowAlbumCreator(true)}
              className="lg-pill px-5 py-2.5 rounded-2xl text-xs font-bold text-white inline-flex items-center gap-2 mx-auto"
              style={{
                background: 'linear-gradient(160deg, hsl(var(--primary) / 0.9) 0%, hsl(var(--primary) / 0.55) 100%)',
                border: '1px solid hsl(var(--primary) / 0.7)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 3px 12px hsl(var(--primary) / 0.4)',
              }}
            >
              <FolderPlus className="w-4 h-4" />
              <span>{t('create_collection')}</span>
            </button>
          </div>
        )
      )}

      {/* Album Creation Panel Modal Overlay.
          Рендерим через портал в document.body, иначе fixed-оверлей привязывается
          к контейнеру .tab-transition (will-change: transform) и выглядит как чёрный квадрат. */}
      {showAlbumCreator && (
        <GlassModal onClose={() => setShowAlbumCreator(false)} z="z-[100]">
          <GlassModalHeader
            icon={<FolderPlus className="w-4 h-4" />}
            title={t('create_collection')}
          />

          <form onSubmit={handleCreateAlbum} className="space-y-4">
            <input
              type="text"
              required
              value={albumName}
              onChange={(e) => setAlbumName(e.target.value)}
              placeholder={t('collection_name')}
              maxLength={30}
              className={glassInput}
            />

            <input
              type="text"
              value={albumDesc}
              onChange={(e) => setAlbumDesc(e.target.value)}
              placeholder={t('collection_desc')}
              maxLength={100}
              className={glassInput}
            />

            <button
              type="submit"
              disabled={creating}
              className={`${glassActionBase} ${glassActionPrimary}`}
            >
              {creating ? t('creating') : t('create')}
            </button>
          </form>
        </GlassModal>
      )}

    </div>
  )
}
