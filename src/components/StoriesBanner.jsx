import { useState, useEffect, useRef } from 'react'
import { Plus, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchActiveStories, uploadStory } from '../lib/supabase'
import { StoriesViewer } from './StoriesViewer'
import { ProfileAvatar } from './ProfileAvatar'

export function StoriesBanner({ currentUser, avatarUrl, nickname }) {
  const { t } = useTranslation()
  const [activeStoryGroups, setActiveStoryGroups] = useState([])
  const [loadingStories, setLoadingStories] = useState(true)
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  
  // Form states
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [caption, setCaption] = useState('')
  const fileInputRef = useRef(null)

  const loadStories = async () => {
    setLoadingStories(true)
    const groups = await fetchActiveStories()
    setActiveStoryGroups(groups)
    setLoadingStories(false)
  }

  useEffect(() => {
    loadStories()
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert(t('invalid_image'))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(t('image_too_large'))
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile || !currentUser) return

    setIsUploading(true)
    try {
      await uploadStory(currentUser.id, selectedFile, caption)
      setUploadModalOpen(false)
      setSelectedFile(null)
      setPreviewUrl(null)
      setCaption('')
      await loadStories()
      alert(t('success_story'))
    } catch (err) {
      console.error(err)
      alert(t('upload_error'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenGroup = (index) => {
    setSelectedGroupIndex(index)
  }

  const handleCloseViewer = () => {
    setSelectedGroupIndex(null)
    loadStories() // Reload in case stories were deleted or read
  }

  // Check if current user has active stories
  const currentUserGroup = activeStoryGroups.find(g => g.user.id === currentUser?.id)
  const otherGroups = activeStoryGroups.filter(g => g.user.id !== currentUser?.id)

  return (
    <div className="w-full py-4 px-2 select-none">
      <div className="flex flex-row flex-nowrap items-center gap-4 overflow-x-auto pb-2 scrollbar-none w-full">
        
        {/* Current User Upload Bubble */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
          <div className="relative">
            {currentUserGroup ? (
              // If current user has stories, show with neon glowing gradient ring
              <div 
                onClick={() => handleOpenGroup(activeStoryGroups.indexOf(currentUserGroup))}
                className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500 p-[3px] shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <div className="w-full h-full rounded-full bg-[#0c0b11] p-[2px]">
                  <img 
                    src={avatarUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                    alt="Me" 
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </div>
            ) : (
              // Otherwise just standard avatar with plus icon
              <div 
                onClick={() => setUploadModalOpen(true)}
                className="w-16 h-16 rounded-full bg-[#181622] hover:bg-[#201e2e] border border-white/5 flex items-center justify-center relative hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <img 
                  src={avatarUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                  alt="Me" 
                  className="w-full h-full rounded-full object-cover p-[2px]"
                />
              </div>
            )}
            
            {/* Pulsing Plus Button */}
            <div 
              onClick={() => setUploadModalOpen(true)}
              className="absolute bottom-0 right-0 w-5 h-5 bg-purple-600 rounded-full border border-[#0c0b11] flex items-center justify-center text-white cursor-pointer shadow-lg shadow-purple-500/20 group-hover:scale-110 active:scale-90 transition-transform"
            >
              <Plus className="w-3.5 h-3.5" />
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-400 group-hover:text-white transition-colors tracking-tight text-center max-w-[70px] truncate">
            {t('you')}
          </span>
        </div>

        {/* Other Users' Active Stories */}
        {loadingStories ? (
          <div className="flex flex-row flex-nowrap gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-col items-center gap-2 flex-shrink-0 animate-pulse">
                <div className="w-16 h-16 rounded-full bg-[#181622] border border-white/5"></div>
                <div className="w-10 h-2.5 bg-[#181622] rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          otherGroups.map((group, index) => {
            const absoluteIndex = activeStoryGroups.indexOf(group)
            return (
              <div 
                key={group.user.id}
                onClick={() => handleOpenGroup(absoluteIndex)}
                className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500 p-[3px] shadow-[0_0_12px_rgba(168,85,247,0.2)] hover:scale-105 active:scale-95 transition-all duration-300 hover:shadow-[0_0_20px_rgba(236,72,153,0.5)]">
                  <div className="w-full h-full rounded-full bg-[#0c0b11] p-[2px]">
                    <img 
                      src={group.user.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                      alt={group.user.nickname} 
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-gray-400 group-hover:text-white transition-colors tracking-tight text-center max-w-[70px] truncate">
                  {group.user.nickname}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Stories Fullscreen Player Modal */}
      {selectedGroupIndex !== null && (
        <StoriesViewer 
          groups={activeStoryGroups} 
          initialGroupIndex={selectedGroupIndex}
          onClose={handleCloseViewer}
        />
      )}

      {/* Upload WIP Story Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#12111a] border border-white/5 rounded-3xl w-full max-w-lg p-6 relative overflow-hidden shadow-2xl shadow-purple-500/10">
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white tracking-tight">{t('add_to_story')} (WIP)</h3>
              <button 
                onClick={() => setUploadModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-6">
              {/* Image selector */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-64 bg-[#181622] rounded-2xl border-2 border-dashed border-white/5 hover:border-purple-500/30 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-300 relative group"
              >
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ImageIcon className="w-8 h-8 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto text-purple-400 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-gray-300">{t('images_photos')}</p>
                    <p className="text-xs text-gray-500">{t('composition_guide_hint')}</p>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-purple-400 uppercase tracking-widest px-1">
                  {t('story_caption')}
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  rows={2}
                  className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 transition-all resize-none"
                  placeholder="e.g. Sketching the background details..."
                />
                <div className="text-right text-[10px] text-gray-500 font-bold px-1">
                  {caption.length}/120
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:text-white/20 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-900/30"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('uploading')}
                  </>
                ) : (
                  t('publish_story')
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
