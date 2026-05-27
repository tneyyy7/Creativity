import { useState, useEffect } from 'react'
import { X, Plus, FolderPlus, Folder, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createCollection, fetchUserCollections, addPaintingToCollection, removePaintingFromCollection, fetchPaintingCollectionStatus } from '../lib/supabase'

export function CollectionsModal({ paintingId, currentUserId, onClose }) {
  const { t } = useTranslation()
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeMappingIds, setActiveMappingIds] = useState([])
  
  // New collection form state
  const [showCreator, setShowCreator] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollDesc, setNewCollDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const loadCollectionsAndStatus = async () => {
    if (!currentUserId || !paintingId) return
    setLoading(true)
    
    const [userColls, mappingIds] = await Promise.all([
      fetchUserCollections(currentUserId),
      fetchPaintingCollectionStatus(paintingId, currentUserId)
    ])

    setCollections(userColls)
    setActiveMappingIds(mappingIds)
    setLoading(false)
  }

  useEffect(() => {
    loadCollectionsAndStatus()
  }, [paintingId, currentUserId])

  const handleToggleMapping = async (collectionId) => {
    const isMapped = activeMappingIds.includes(collectionId)
    
    try {
      if (isMapped) {
        await removePaintingFromCollection(collectionId, paintingId)
        setActiveMappingIds(prev => prev.filter(id => id !== collectionId))
      } else {
        await addPaintingToCollection(collectionId, paintingId)
        setActiveMappingIds(prev => [...prev, collectionId])
      }
    } catch (err) {
      console.error(err)
      alert("Ошибка при обновлении альбома")
    }
  }

  const handleCreateCollection = async (e) => {
    e.preventDefault()
    if (!newCollName.trim() || !currentUserId) return

    setCreating(true)
    try {
      const newColl = await createCollection(currentUserId, newCollName.trim(), newCollDesc.trim())
      setNewCollName('')
      setNewCollDesc('')
      setShowCreator(false)
      
      // Instantly add work to the newly created collection!
      await addPaintingToCollection(newColl.id, paintingId)
      
      // Reload everything
      await loadCollectionsAndStatus()
      alert(t('create_album_success'))
    } catch (err) {
      console.error(err)
      alert("Ошибка при создании коллекции")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#12111a] border border-white/5 rounded-3xl w-full max-w-md p-6 relative overflow-hidden shadow-2xl shadow-purple-500/10">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Folder className="w-5 h-5 text-purple-400" />
            <span>{t('save_to_collection')}</span>
          </h3>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            
            {collections.length > 0 ? (
              collections.map((coll) => {
                const isSelected = activeMappingIds.includes(coll.id)
                return (
                  <div 
                    key={coll.id}
                    onClick={() => handleToggleMapping(coll.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                      isSelected 
                        ? 'bg-purple-600/10 border-purple-500/30 text-purple-400' 
                        : 'bg-[#181622] hover:bg-[#201e2e] border-white/5 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className={`w-5 h-5 ${isSelected ? 'text-purple-400' : 'text-gray-500'}`} />
                      <div className="text-left">
                        <p className="text-xs font-bold text-white leading-none mb-1">{coll.name}</p>
                        {coll.description && (
                          <p className="text-[10px] text-gray-500 font-medium line-clamp-1">{coll.description}</p>
                        )}
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 bg-[#0c0b11]'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-gray-500 text-center py-6">
                {t('no_collections_yet')}
              </p>
            )}

          </div>
        )}

        {/* Creator segment */}
        <div className="mt-6 border-t border-white/5 pt-4">
          {!showCreator ? (
            <button
              onClick={() => setShowCreator(true)}
              className="w-full py-3 bg-[#181622] hover:bg-[#201e2e] border border-white/5 text-xs text-gray-300 hover:text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4 text-purple-400" />
              <span>{t('create_collection')}</span>
            </button>
          ) : (
            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div className="space-y-1">
                <input
                  type="text"
                  required
                  value={newCollName}
                  onChange={(e) => setNewCollName(e.target.value)}
                  placeholder={t('collection_name')}
                  maxLength={30}
                  className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 transition-all"
                />
              </div>

              <div className="space-y-1">
                <input
                  type="text"
                  value={newCollDesc}
                  onChange={(e) => setNewCollDesc(e.target.value)}
                  placeholder={t('collection_desc')}
                  maxLength={100}
                  className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreator(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 hover:text-white rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
                  <span>Create</span>
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  )
}
