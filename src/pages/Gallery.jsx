import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Trash2, MoreHorizontal, User, Palette, X, Upload, Loader2, Star, Medal, Zap, Crown, Sparkles, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, uploadPainting, fetchPaintings, savePaintingMetadata, deletePainting } from '../lib/supabase'

export function Gallery({ onOpenPost }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [paintings, setPaintings] = useState([])
  const [loading, setLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
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
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const publicUrl = await uploadPainting(file, user.id)
      
      const newPainting = {
        user_id: user.id,
        title: file.name.split('.')[0] || 'Untitled',
        image_url: publicUrl,
        description: 'New upload',
        category: 'Digital',
        is_finished: false // Force false for new uploads
      }

      await savePaintingMetadata(newPainting)
      await loadPaintings()
    } catch (err) {
      console.error("Upload error:", err)
      alert("Failed to upload: " + (err.message || "Unknown error"))
    } finally {
      setIsUploading(false)
    }
  }

  const [replacingId, setReplacingId] = useState(null)
  const replaceInputRef = useRef(null)

  const handleReplaceImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !replacingId) return

    setIsUploading(true)
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
      setIsUploading(false)
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

  const handleUpdateMetadata = async () => {
    if (!editingPainting || !newTitle.trim()) return
    try {
      const { error } = await supabase
        .from('paintings')
        .update({ 
          title: newTitle.trim(),
          description: newDescription.trim()
        })
        .eq('id', editingPainting.id)
      if (error) throw error
      setPaintings(paintings.map(p => p.id === editingPainting.id ? { 
        ...p, 
        title: newTitle.trim(), 
        description: newDescription.trim() 
      } : p))
      setEditingPainting(null)
    } catch (err) {
      console.error("Update metadata error:", err)
      alert("Failed to update")
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

  const filteredPaintings = paintings.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-8 md:space-y-12 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('gallery')}</h1>
          <p className="text-gray-500 text-sm sm:text-base md:text-lg font-medium">Your artistic legacy.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            accept="image/*"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
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
                {isUploading ? t('uploading') : t('upload_new')}
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
            <Plus className="w-5 h-5" /> Take with Camera
          </button>
        </div>

        {filteredPaintings.map((painting) => (
          <div key={painting.id} className="glass-card group relative overflow-hidden flex flex-col h-full hover:-translate-y-2 transition-all duration-500 border-white/5 hover:border-purple-500/30 shadow-2xl">
            <div className="aspect-[4/3] overflow-hidden relative">
              <img 
                src={painting.image_url} 
                alt={painting.title} 
                className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 cursor-pointer ${painting.is_finished ? 'opacity-100' : 'opacity-70'}`}
                onClick={() => onOpenPost?.(painting.id, painting, filteredPaintings, filteredPaintings.indexOf(painting))}
              />
              {/* Top status bar */}
              <div className="absolute top-0 left-0 right-0 p-4 sm:p-5 flex items-start justify-between z-10 pointer-events-none">
                 <div className="flex flex-col gap-2">
                   <div className="px-3 py-1.5 bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl flex items-center gap-2 self-start pointer-events-auto">
                      <div className={`w-1.5 h-1.5 rounded-full ${painting.is_ai_generated ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] animate-pulse' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'}`}></div>
                      <span className="text-[9px] font-black text-white uppercase tracking-widest whitespace-nowrap">
                        {painting.is_ai_generated ? t('ai_gen') : t('handmade')}
                      </span>
                   </div>
                   {painting.is_finished && (
                     <div className="px-3 py-1.5 bg-emerald-500/95 backdrop-blur-xl rounded-xl flex items-center gap-1.5 shadow-2xl border border-emerald-400/30 self-start pointer-events-auto">
                        <Star className="w-2.5 h-2.5 text-white fill-white" />
                        <span className="text-[9px] font-black text-white uppercase tracking-widest whitespace-nowrap">{t('masterpiece')}</span>
                     </div>
                   )}
                 </div>
                 
                 <div className="flex gap-2 pointer-events-auto">
                   <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setEditingPainting(painting); 
                      setNewTitle(painting.title);
                      setNewDescription(painting.description || '');
                    }}
                    className="w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-white flex items-center justify-center hover:bg-purple-600 transition-all shadow-xl"
                    title="Edit Metadata"
                   >
                      <MoreHorizontal className="w-5 h-5" />
                   </button>
                   <button 
                    onClick={(e) => { e.stopPropagation(); setReplacingId(painting.id); replaceInputRef.current?.click(); }}
                    className="w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl text-white flex items-center justify-center hover:bg-indigo-600 transition-all shadow-xl"
                    title="Replace Image"
                   >
                      <Upload className="w-4 h-4" />
                   </button>
                 </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                <div className="grid grid-cols-3 gap-4">
                  <button 
                    onClick={() => onOpenPost?.(painting.id, painting, filteredPaintings, filteredPaintings.indexOf(painting))}
                    className="aspect-square bg-white text-purple-900 rounded-2xl flex flex-col items-center justify-center gap-1.5 hover:bg-purple-50 transition-all shadow-xl active:scale-95 group/btn"
                  >
                    <User className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">View</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleFinished(painting); }}
                    className={`aspect-square rounded-2xl transition-all border flex flex-col items-center justify-center gap-1.5 shadow-xl active:scale-95 group/btn ${painting.is_finished ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500' : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'}`}
                  >
                    {painting.is_finished ? <Loader2 className="w-5 h-5 group-hover/btn:rotate-180 transition-transform" /> : <Star className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />}
                    <span className="text-[9px] font-black uppercase tracking-tighter">{painting.is_finished ? t('edit') : t('finish')}</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(painting.id); }}
                    className="aspect-square bg-red-500/20 backdrop-blur-xl border border-red-500/30 rounded-2xl text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-xl active:scale-95 flex flex-col items-center justify-center gap-1.5 group/btn"
                  >
                    <Trash2 className="w-5 h-5 group-hover/btn:shake transition-transform" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">Delete</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="p-8 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-black text-white tracking-tight group-hover:text-purple-400 transition-colors uppercase">{painting.title}</h3>
                <p className="text-[11px] text-gray-500 font-black uppercase tracking-widest">
                  {new Date(painting.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-500 line-clamp-2 leading-relaxed">{painting.description}</p>
            </div>
          </div>
        ))}
      </div>

      {editingPainting && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
           <div className="glass-card p-10 w-full max-w-lg space-y-6">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Edit Masterpiece</h3>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">Title</label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-14 px-6 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-bold transition-all"
                  placeholder="The Masterpiece Name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">Description</label>
                <textarea 
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full min-h-[120px] p-6 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500 text-white font-medium transition-all resize-none"
                  placeholder="Tell the story of this art..."
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => setEditingPainting(null)}
                  className="flex-1 py-4 bg-white/5 text-gray-400 font-bold rounded-2xl hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateMetadata}
                  className="flex-1 py-4 bg-purple-600 text-white font-black rounded-2xl hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/40"
                >
                  Save Changes
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
