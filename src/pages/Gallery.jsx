import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search, Trash2, MoreHorizontal, User, Palette, X, Upload, Loader2, Star, Medal, Zap, Crown, Sparkles, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, uploadPainting, fetchPaintings, savePaintingMetadata, deletePainting, fetchPaintingTags, savePaintingTags } from '../lib/supabase'

export function Gallery({ onOpenPost }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [paintings, setPaintings] = useState([])
  const [loading, setLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(null) // null or string status
  const [filter, setFilter] = useState('all') // 'all', 'finished', 'in_progress'
  const [newCategory, setNewCategory] = useState('Digital')
  const [newTags, setNewTags] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadPaintings()
  }, [])

  const loadPaintings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const data = await fetchPaintings(user.id)
        setPaintings(data || [])
      }
    } catch (err) {
      console.error("Error loading paintings:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const uploaded = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const status = files.length > 1
          ? `${t('uploading')} (${i + 1}/${files.length})`
          : t('uploading')

        setIsUploading(status)

        const publicUrl = await uploadPainting(file, user.id)
        uploaded.push({
          image_url: publicUrl,
          fileName: file.name.split('.')[0] || t('untitled')
        })
      }

      // Open the details form instead of publishing immediately. Nothing appears on
      // the profile until the user fills in title/category/tags and confirms.
      setEditingPainting(null)
      setPendingUploads(uploaded)
      setPendingIndex(0)
      setNewTitle(uploaded[0].fileName)
      setNewDescription('')
      setNewCategory('Digital')
      setNewTags('')
    } catch (err) {
      console.error("Upload error:", err)
      alert("Failed to upload: " + (err.message || "Unknown error"))
    } finally {
      setIsUploading(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePublishUpload = async () => {
    if (!newTitle.trim() || pendingUploads.length === 0) return
    const current = pendingUploads[pendingIndex]
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const tagNamesArray = newTags
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)

      const newPainting = await savePaintingMetadata({
        user_id: user.id,
        title: newTitle.trim(),
        image_url: current.image_url,
        description: newDescription.trim(),
        category: newCategory,
        is_finished: false
      })

      if (tagNamesArray.length > 0) {
        await savePaintingTags(newPainting.id, tagNamesArray)
      }

      // Move on to the next uploaded image, or close once all are published.
      const nextIndex = pendingIndex + 1
      if (nextIndex < pendingUploads.length) {
        setPendingIndex(nextIndex)
        setNewTitle(pendingUploads[nextIndex].fileName)
        setNewDescription('')
        setNewCategory('Digital')
        setNewTags('')
      } else {
        setPendingUploads([])
        setPendingIndex(0)
      }

      await loadPaintings()
    } catch (err) {
      console.error("Publish error:", err)
      alert("Failed to publish: " + (err.message || err))
    }
  }

  const [replacingId, setReplacingId] = useState(null)
  const replaceInputRef = useRef(null)

  const handleReplaceImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !replacingId) return

    setIsUploading(t('uploading'))
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const publicUrl = await uploadPainting(file, user.id)
      
      const { error } = await supabase
        .from('paintings')
        .update({ image_url: publicUrl })
        .eq('id', replacingId)
      
      if (error) throw error
      await loadPaintings()
      setReplacingId(null)
    } catch (err) {
      console.error("Replace error:", err)
      alert("Failed to replace image")
    } finally {
      setIsUploading(null)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('delete_confirm'))) return
    try {
      await deletePainting(id)
      setPaintings(paintings.filter(p => p.id !== id))
    } catch (err) {
      console.error("Delete error:", err)
    }
  }

  const [editingPainting, setEditingPainting] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  // Queue of just-uploaded images awaiting their details before being published.
  const [pendingUploads, setPendingUploads] = useState([])
  const [pendingIndex, setPendingIndex] = useState(0)

  const startEditing = async (painting) => {
    setEditingPainting(painting)
    setNewTitle(painting.title)
    setNewDescription(painting.description || '')
    setNewCategory(painting.category || 'Digital')
    setNewTags('')
    try {
      const tags = await fetchPaintingTags(painting.id)
      setNewTags(tags.map(t => t.name).join(', '))
    } catch (err) {
      console.error("Error fetching tags for editing:", err)
    }
  }

  const handleUpdateMetadata = async () => {
    if (!editingPainting || !newTitle.trim()) return
    try {
      const tagNamesArray = newTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const { error } = await supabase
        .from('paintings')
        .update({ 
          title: newTitle.trim(),
          description: newDescription.trim(),
          category: newCategory
        })
        .eq('id', editingPainting.id)
      if (error) throw error

      await savePaintingTags(editingPainting.id, tagNamesArray)

      setPaintings(paintings.map(p => p.id === editingPainting.id ? { 
        ...p, 
        title: newTitle.trim(), 
        description: newDescription.trim(),
        category: newCategory
      } : p))
      setEditingPainting(null)
    } catch (err) {
      console.error("Update metadata error:", err)
      alert("Failed to update: " + (err.message || err))
    }
  }

  const toggleFinished = async (painting) => {
    try {
      const { error } = await supabase
        .from('paintings')
        .update({ is_finished: !painting.is_finished })
        .eq('id', painting.id)
      if (error) throw error
      setPaintings(paintings.map(p => p.id === painting.id ? { ...p, is_finished: !painting.is_finished } : p))
    } catch (err) {
      console.error("Toggle error:", err)
    }
  }

  const filteredPaintings = paintings.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' 
      ? true 
      : filter === 'finished' 
        ? p.is_finished 
        : !p.is_finished
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-8 md:space-y-12 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('gallery')}</h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">{t('gallery_subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            accept="image/*"
            multiple
          />
          <input 
            type="file" 
            className="hidden" 
            ref={replaceInputRef} 
            onChange={handleReplaceImage}
            accept="image/*"
          />
          <div className="relative group flex-1 sm:flex-none w-full lg:w-80">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
            <input 
              type="text" 
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-14 pl-14 pr-6 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white font-medium"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-fit">
        {[
          { id: 'all', label: t('filter_all') },
          { id: 'finished', label: t('filter_finished') },
          { id: 'in_progress', label: t('filter_in_progress') }
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`lg-pill px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter ${
              filter === f.id ? 'lg-pill--active' : ''
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.removeAttribute('capture')
                fileInputRef.current.click()
              }
            }}
            disabled={isUploading}
            className="glass-card aspect-[10/11] flex flex-col items-center justify-center gap-6 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-600/5 transition-all group duration-500"
          >
            <div className="w-20 h-20 rounded-[2.5rem] bg-white/5 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-all transform group-hover:rotate-90">
               {isUploading ? <Loader2 className="w-10 h-10 text-gray-500 animate-spin" /> : <Upload className="text-gray-500 group-hover:text-white w-10 h-10" />}
            </div>
            <div className="text-center">
              <span className="block text-lg font-black text-white mb-1">
                {isUploading || t('upload_new')}
              </span>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('images_photos')}</span>
            </div>
          </button>
          
          <button 
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute('capture', 'environment')
                fileInputRef.current.click()
              }
            }}
            disabled={isUploading}
            className="glass-card py-4 flex items-center justify-center gap-3 border-white/5 hover:bg-white/5 text-gray-400 font-bold transition-all"
          >
            <Plus className="w-5 h-5" /> {t('take_with_camera')}
          </button>
        </div>

        {filteredPaintings.map((painting) => (
          <div key={painting.id} className="glass-card group relative overflow-hidden flex flex-col h-full hover:-translate-y-2 transition-all duration-500 border-white/5 hover:border-purple-500/30 shadow-2xl">
            <div className="aspect-[4/3] overflow-hidden relative">
              <img
                src={painting.image_url}
                alt={painting.title}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 cursor-pointer ${painting.is_finished ? 'opacity-100' : 'opacity-70'}`}
                onClick={() => onOpenPost?.(painting.id, painting, filteredPaintings, filteredPaintings.indexOf(painting))}
              />
              {/* Top status bar */}
              <div className="absolute top-0 left-0 right-0 p-4 sm:p-5 flex items-start justify-between z-10 pointer-events-none">
                  <div className="flex flex-col gap-2">
                   {painting.is_finished && (
                     <div className="px-3 py-1.5 bg-emerald-500/95 backdrop-blur-xl rounded-xl flex items-center gap-1.5 shadow-2xl border border-emerald-400/30 self-start pointer-events-auto">
                        <Star className="w-2.5 h-2.5 !text-white !fill-white" />
                        <span className="text-[9px] font-black !text-white uppercase tracking-widest whitespace-nowrap">{t('masterpiece')}</span>
                     </div>
                   )}
                 </div>
                 
                 <div className="flex gap-2 pointer-events-auto">
                   <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      startEditing(painting);
                    }}
                    className="w-10 h-10 bg-black/60 backdrop-blur-xl !border-white/10 rounded-xl !text-white flex items-center justify-center hover:bg-purple-600 transition-all shadow-xl"
                    title={t('edit_metadata')}
                   >
                      <MoreHorizontal className="w-5 h-5" />
                   </button>
                   <button 
                    onClick={(e) => { e.stopPropagation(); setReplacingId(painting.id); replaceInputRef.current?.click(); }}
                    className="w-10 h-10 bg-black/60 backdrop-blur-xl !border-white/10 rounded-xl !text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-xl"
                    title={t('replace_image')}
                   >
                      <Upload className="w-4 h-4" />
                   </button>
                 </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => onOpenPost?.(painting.id, painting, filteredPaintings, filteredPaintings.indexOf(painting))}
                    className="bg-white text-purple-900 rounded-xl flex flex-col items-center justify-center py-2 px-1 hover:bg-purple-50 transition-all shadow-md active:scale-95 group/btn w-full"
                  >
                    <User className="w-4 h-4 group-hover/btn:scale-110 transition-transform mb-0.5" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">{t('view')}</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleFinished(painting); }}
                    className={`rounded-xl transition-all border flex flex-col items-center justify-center py-2 px-1 shadow-md active:scale-95 group/btn w-full ${painting.is_finished ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500' : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'}`}
                  >
                    {painting.is_finished ? <Loader2 className="w-4 h-4 group-hover/btn:rotate-180 transition-transform mb-0.5" /> : <Star className="w-4 h-4 group-hover/btn:scale-110 transition-transform mb-0.5" />}
                    <span className="text-[9px] font-black uppercase tracking-tighter">{painting.is_finished ? t('edit') : t('finish')}</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(painting.id); }}
                    className="bg-red-500/20 backdrop-blur-xl border border-red-500/30 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-md active:scale-95 flex flex-col items-center justify-center py-2 px-1 group/btn w-full"
                  >
                    <Trash2 className="w-4 h-4 group-hover/btn:shake transition-transform mb-0.5" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">{t('delete')}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-black text-white tracking-tight group-hover:text-purple-400 transition-colors uppercase">{painting.title}</h3>
                <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest">
                  {new Date(painting.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-500 line-clamp-2 leading-relaxed">{painting.description === 'New upload' ? t('new_upload_desc', 'New upload') : painting.description}</p>
            </div>
          </div>
        ))}
      </div>

      {(editingPainting || pendingUploads.length > 0) && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in zoom-in duration-300 overflow-y-auto">
           <div className="glass-card p-5 sm:p-6 w-full max-w-lg space-y-3.5 my-auto max-h-[95vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                  {pendingUploads.length > 0 ? t('publish_artwork', 'Опубликовать работу') : t('edit_masterpiece')}
                </h3>
                {pendingUploads.length > 1 && (
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest whitespace-nowrap">
                    {pendingIndex + 1} / {pendingUploads.length}
                  </span>
                )}
              </div>

              {pendingUploads.length > 0 && (
                <div className="h-28 sm:h-32 w-full overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center p-2">
                  <img
                    src={pendingUploads[pendingIndex].image_url}
                    alt={newTitle}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('title_label')}</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-11 px-5 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-bold transition-all text-xs"
                  placeholder={t('title_placeholder')}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('description_label')}</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full min-h-[60px] max-h-[100px] p-4 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-medium transition-all resize-none text-xs"
                  placeholder={t('description_placeholder')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('category_label')}</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-11 px-5 bg-[#16151c] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-bold transition-all text-xs"
                  >
                    <option value="Digital">{t('cat_digital')}</option>
                    <option value="Painting">{t('cat_painting')}</option>
                    <option value="Photography">{t('cat_photography')}</option>
                    <option value="Sculpture">{t('cat_sculpture')}</option>
                    <option value="Design">{t('cat_design')}</option>
                    <option value="3D">{t('cat_3d')}</option>
                    <option value="Sketching">{t('cat_sketching')}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('tags_label')}</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="w-full h-11 px-5 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-bold transition-all text-xs"
                    placeholder={t('tags_placeholder')}
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => {
                    if (pendingUploads.length > 0) {
                      setPendingUploads([])
                      setPendingIndex(0)
                    } else {
                      setEditingPainting(null)
                    }
                  }}
                  className="flex-1 py-3 bg-white/5 text-gray-400 font-bold rounded-2xl hover:bg-white/10 transition-all text-xs"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={pendingUploads.length > 0 ? handlePublishUpload : handleUpdateMetadata}
                  className="flex-1 py-3 bg-purple-600 text-white font-black rounded-2xl hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/40 text-xs"
                >
                  {pendingUploads.length > 0 ? t('publish', 'Опубликовать') : t('save_changes')}
                </button>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  )
}
