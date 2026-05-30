import { useState, useEffect } from 'react'
import { X, Plus, FolderPlus, Folder, Check, Loader2, Bookmark } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createCollection, fetchUserCollections, addPaintingToCollection, removePaintingFromCollection, fetchPaintingCollectionStatus } from '../lib/supabase'

/**
 * Two modes:
 * 1. Save mode (onSave is provided): shown BEFORE bookmarking — user picks albums, then clicks "Save to Bookmarks".
 *    onSave(selectedCollectionIds) is called, parent handles actual bookmark + collection inserts.
 * 2. Organize mode (no onSave): shown on an already-bookmarked painting — toggles collection membership immediately.
 */
export function CollectionsModal({ paintingId, currentUserId, onClose, onSave }) {
  const { t } = useTranslation()
  const isSaveMode = !!onSave

  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  // In organize mode: IDs of collections the painting is already in.
  // In save mode: IDs the user has selected (pending, not yet written to DB).
  const [activeIds, setActiveIds] = useState([])
  const [saving, setSaving] = useState(false)

  // New collection form
  const [showCreator, setShowCreator] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollDesc, setNewCollDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    if (!currentUserId || !paintingId) return
    setLoading(true)
    try {
      const [userColls, mappingIds] = await Promise.all([
        fetchUserCollections(currentUserId),
        // In save mode we still fetch current status so we can pre-select if somehow already in a collection.
        fetchPaintingCollectionStatus(paintingId, currentUserId)
      ])
      setCollections(userColls || [])
      setActiveIds(mappingIds || [])
    } catch (err) {
      console.error('CollectionsModal load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [paintingId, currentUserId])

  const handleToggle = async (collectionId) => {
    if (isSaveMode) {
      // Just track pending selection; DB writes happen in handleSave.
      setActiveIds(prev =>
        prev.includes(collectionId) ? prev.filter(id => id !== collectionId) : [...prev, collectionId]
      )
      return
    }

    // Organize mode: write immediately (optimistic).
    const isMapped = activeIds.includes(collectionId)
    try {
      if (isMapped) {
        await removePaintingFromCollection(collectionId, paintingId)
        setActiveIds(prev => prev.filter(id => id !== collectionId))
      } else {
        await addPaintingToCollection(collectionId, paintingId)
        setActiveIds(prev => [...prev, collectionId])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    if (!isSaveMode) return
    setSaving(true)
    try {
      await onSave(activeIds)
    } finally {
      setSaving(false)
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

      if (isSaveMode) {
        // Just pre-select the new collection; actual DB insert happens on Save.
        await load()
        setActiveIds(prev => [...prev, newColl.id])
      } else {
        // Organize mode: add to collection immediately.
        await addPaintingToCollection(newColl.id, paintingId)
        await load()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[500] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#12111a] border border-white/5 rounded-3xl w-full max-w-md p-6 relative overflow-hidden shadow-2xl shadow-purple-500/10 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-purple-400 fill-purple-400/20" />
            <span>{isSaveMode ? t('bookmark_save_btn') : t('save_to_collection')}</span>
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {isSaveMode && (
          <p className="text-xs text-gray-500 mb-5">{t('choose_album_hint')}</p>
        )}

        {/* Collection list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className={`space-y-2 overflow-y-auto pr-1 custom-scrollbar ${isSaveMode ? 'max-h-[220px]' : 'max-h-[300px]'}`}>
            {collections.length > 0 ? (
              collections.map((coll) => {
                const isSelected = activeIds.includes(coll.id)
                return (
                  <div
                    key={coll.id}
                    onClick={() => handleToggle(coll.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'bg-purple-600/10 border-purple-500/30 text-purple-400'
                        : 'bg-[#181622] hover:bg-[#201e2e] border-white/5 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Folder className={`w-5 h-5 shrink-0 ${isSelected ? 'text-purple-400' : 'text-gray-500'}`} />
                      <div className="text-left min-w-0">
                        <p className="text-xs font-bold text-white leading-none mb-1 truncate">{coll.name}</p>
                        {coll.description && (
                          <p className="text-[10px] text-gray-500 font-medium line-clamp-1">{coll.description}</p>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-700 bg-[#0c0b11]'
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-gray-500 text-center py-6">{t('no_collections_yet')}</p>
            )}
          </div>
        )}

        {/* Create collection */}
        <div className="mt-4 border-t border-white/5 pt-4">
          {!showCreator ? (
            <button
              onClick={() => setShowCreator(true)}
              className="w-full py-3 bg-[#181622] hover:bg-[#201e2e] border border-white/5 text-xs text-gray-300 hover:text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4 text-purple-400" />
              <span>{t('create_collection')}</span>
            </button>
          ) : (
            <form onSubmit={handleCreateCollection} className="space-y-3">
              <input
                type="text"
                required
                value={newCollName}
                onChange={(e) => setNewCollName(e.target.value)}
                placeholder={t('collection_name')}
                maxLength={30}
                className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 transition-all"
              />
              <input
                type="text"
                value={newCollDesc}
                onChange={(e) => setNewCollDesc(e.target.value)}
                placeholder={t('collection_desc')}
                maxLength={100}
                className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-gray-600 transition-all"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreator(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 hover:text-white rounded-xl transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
                  <span>{t('create')}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Save mode action button */}
        {isSaveMode && !showCreator && (
          <div className="mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-900/30"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('saving_bookmark')}</>
                : <><Bookmark className="w-4 h-4 fill-white/20" /> {activeIds.length > 0 ? t('save_to_album') : t('bookmark_save_btn')}</>
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
