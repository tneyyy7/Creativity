import { useState, useEffect, useRef } from 'react'
import { Plus, X, Image as ImageIcon, Loader2, Gem, BadgeCheck, Camera, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchActiveStories, uploadStory, fetchViewedStoryIds } from '../lib/supabase'
import { StoriesViewer } from './StoriesViewer'
import { ProfileAvatar } from './ProfileAvatar'
import { createPortal } from 'react-dom'
import { getNicknameStyle } from '../lib/nicknameStyle'

export function StoriesBanner({ currentUser, avatarUrl, nickname, isPro, onViewProfile }) {
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
  const photoCaptureRef = useRef(null)
  const videoCaptureRef = useRef(null)

  // Drawing states
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushColor, setBrushColor] = useState('#ec4899') // default purple/pink
  const [brushSize, setBrushSize] = useState(4)

  // Interactive Pan & Zoom states
  const [editMode, setEditMode] = useState('pan') // 'pan' or 'draw'
  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [dimensions, setDimensions] = useState({ w: 270, h: 480 })
  const [pinchStartDist, setPinchStartDist] = useState(0)

  // Helper for natural "cover" sizing inside a 270x480 container
  const getCoverDimensions = (imgWidth, imgHeight, containerWidth = 270, containerHeight = 480) => {
    const imgRatio = imgWidth / imgHeight
    const containerRatio = containerWidth / containerHeight
    
    let w, h
    if (imgRatio > containerRatio) {
      h = containerHeight
      w = containerHeight * imgRatio
    } else {
      w = containerWidth
      h = containerWidth / imgRatio
    }
    return { w, h }
  }

  // Interactive handlers
  const handlePanStart = (e) => {
    if (editMode !== 'pan') return
    e.preventDefault()
    e.stopPropagation()
    
    // Support multi-touch pinch detection
    if (e.touches && e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      setPinchStartDist(dist)
      return
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setPanStart({ x: clientX - panX, y: clientY - panY })
    setIsPanning(true)
  }

  const handlePanMove = (e) => {
    if (editMode !== 'pan') return
    e.preventDefault()
    e.stopPropagation()

    // Multi-touch pinch-to-zoom
    if (e.touches && e.touches.length === 2 && pinchStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const factor = dist / pinchStartDist
      let newScale = scale * factor
      newScale = Math.max(0.3, Math.min(4, newScale))
      setScale(newScale)
      setPinchStartDist(dist)
      return
    }

    if (!isPanning) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    setPanX(clientX - panStart.x)
    setPanY(clientY - panStart.y)
  }

  const handlePanEnd = (e) => {
    e.stopPropagation()
    setIsPanning(false)
    setPinchStartDist(0)
  }

  const handleWheel = (e) => {
    if (editMode !== 'pan') return
    e.stopPropagation()
    const zoomFactor = 0.1
    let newScale = scale + (e.deltaY < 0 ? zoomFactor : -zoomFactor)
    newScale = Math.max(0.3, Math.min(4, newScale))
    setScale(newScale)
  }

  const [viewedStoryIds, setViewedStoryIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('viewed_stories') || '[]')
    } catch (e) {
      return []
    }
  })

  const loadStories = async () => {
    setLoadingStories(true)
    const groups = await fetchActiveStories()

    // Merge local (instant) and DB (cross-device) viewed state.
    // DB is the source of truth for synced views; localStorage covers offline/just-viewed.
    try {
      const viewedStr = localStorage.getItem('viewed_stories') || '[]'
      const localViewed = JSON.parse(viewedStr)

      // Pull views recorded on other devices for the same account
      const dbViewed = currentUser?.id ? await fetchViewedStoryIds(currentUser.id) : []
      const merged = [...new Set([...localViewed, ...dbViewed])]

      if (groups.length > 0) {
        // Prune to only active story IDs — prevents unbounded localStorage growth
        const activeIds = new Set(groups.flatMap(g => g.stories?.map(s => s.id) || []))
        const pruned = merged.filter(id => activeIds.has(id))
        localStorage.setItem('viewed_stories', JSON.stringify(pruned))
        setViewedStoryIds(pruned)
      } else {
        setViewedStoryIds(merged)
      }
    } catch (e) {
      console.error("Error syncing viewed stories:", e)
    }

    setActiveStoryGroups(groups)
    setLoadingStories(false)
  }

  useEffect(() => {
    loadStories()
  }, [currentUser?.id])

  const isGroupFullyViewed = (group) => {
    if (!group || !group.stories || group.stories.length === 0) return true
    return group.stories.every(s => viewedStoryIds.includes(s.id))
  }

  // Canvas drawing config effect (Fixed resolution to 270x480 for precise mapping)
  useEffect(() => {
    if (previewUrl && canvasRef.current && selectedFile && !selectedFile.type.startsWith('video/')) {
      const canvas = canvasRef.current
      canvas.width = 270
      canvas.height = 480
      const ctx = canvas.getContext('2d')
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = brushColor
      ctx.lineWidth = brushSize
    }
  }, [previewUrl, brushColor, brushSize, selectedFile])

  // Effect to calculate base cover dimensions of original image
  useEffect(() => {
    if (previewUrl && selectedFile && !selectedFile.type.startsWith('video/')) {
      const img = new Image()
      img.src = previewUrl
      img.onload = () => {
        const dims = getCoverDimensions(img.naturalWidth, img.naturalHeight, 270, 480)
        setDimensions(dims)
      }
    } else {
      setDimensions({ w: 270, h: 480 })
    }
    
    // Reset transform adjustments on file change
    setScale(1)
    setPanX(0)
    setPanY(0)
  }, [previewUrl, selectedFile])

  const startDrawing = (e) => {
    e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    setIsDrawing(true)
  }

  const draw = (e) => {
    e.stopPropagation()
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = (e) => {
    e.stopPropagation()
    setIsDrawing(false)
  }

  const clearCanvas = (e) => {
    if (e) e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Please select an image or video file.')
      return
    }

    if (file.size > 20 * 1024 * 1024) { // 20MB max for video
      alert('File is too large (max 20MB).')
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
      let fileToUpload = selectedFile
      let captionToUpload = caption
      
      // If it's an image, merge/crop drawing and custom zoom/pan transforms into a 9:16 vertical format (1080x1920)
      if (selectedFile.type.startsWith('image/')) {
        const canvas = canvasRef.current
        let hasDrawn = false
        if (canvas) {
          const ctx = canvas.getContext('2d')
          const buffer = ctx.getImageData(0, 0, canvas.width, canvas.height)
          hasDrawn = buffer.data.some(channel => channel !== 0)
        }
        
        // Merge if drawn or scaled/panned
        if (hasDrawn || scale !== 1 || panX !== 0 || panY !== 0) {
          const mergeCanvas = document.createElement('canvas')
          const mergeCtx = mergeCanvas.getContext('2d')
          
          const img = new Image()
          img.src = previewUrl
          await new Promise((resolve) => { img.onload = resolve })
          
          mergeCanvas.width = 1080
          mergeCanvas.height = 1920
          
          // Fill background black
          mergeCtx.fillStyle = '#000000'
          mergeCtx.fillRect(0, 0, 1080, 1920)
          
          // Factor from 270 preview width to 1080 canvas width
          const factor = 1080 / 270 // exactly 4
          const x_prev = (270 - dimensions.w * scale) / 2 + panX
          const y_prev = (480 - dimensions.h * scale) / 2 + panY
          const w_prev = dimensions.w * scale
          const h_prev = dimensions.h * scale
          
          // Draw scaled and translated image
          mergeCtx.drawImage(img, x_prev * factor, y_prev * factor, w_prev * factor, h_prev * factor)
          
          // Draw user drawing on top (if canvas exists)
          if (canvas) {
            mergeCtx.drawImage(canvas, 0, 0, 1080, 1920)
          }
          
          const blob = await new Promise(resolve => mergeCanvas.toBlob(resolve, 'image/jpeg', 0.9))
          fileToUpload = new File([blob], selectedFile.name.replace(/\.[^/.]+$/, "") + "-cropped.jpg", { type: 'image/jpeg' })
        }
      } else if (selectedFile.type.startsWith('video/')) {
        // If it's a video, serialize the transform adjustments into the caption
        if (scale !== 1 || panX !== 0 || panY !== 0) {
          captionToUpload = caption + '___TRANSFORM:' + JSON.stringify({ scale, panX, panY })
        }
      }

      await uploadStory(currentUser.id, fileToUpload, captionToUpload, isPro)
      setUploadModalOpen(false)
      setSelectedFile(null)
      setPreviewUrl(null)
      setCaption('')
      setScale(1)
      setPanX(0)
      setPanY(0)
      setEditMode('pan')
      await loadStories()
      alert(t('success_story'))
    } catch (err) {
      console.error('Story upload error:', err)
      const msg = err?.message || err?.error_description || String(err)
      alert(`${t('story_upload_failed')} ${msg}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenGroup = (index) => {
    setSelectedGroupIndex(index)
  }

  const handleCloseViewer = () => {
    setSelectedGroupIndex(null)
    loadStories() // Reload stories and sync viewed state from localStorage
  }

  // Check if current user has active stories
  const currentUserGroup = activeStoryGroups.find(g => g.user.id === currentUser?.id)
  const otherGroups = activeStoryGroups.filter(g => g.user.id !== currentUser?.id)

  return (
    <div className="w-full py-4 px-2 select-none">
      <div className="flex flex-row flex-nowrap items-start gap-4 overflow-x-auto pb-2 scrollbar-none w-full">
        
        {/* Current User Upload Bubble */}
        <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
          <div className="relative">
            {currentUserGroup ? (
              // If current user has stories, show with neon glowing gradient ring or simple gray border if fully viewed
              <div
                onClick={() => handleOpenGroup(activeStoryGroups.indexOf(currentUserGroup))}
                className="relative w-16 h-16 hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer"
              >
                {/* Ring layer */}
                <div className={`absolute inset-0 rounded-full ${
                  isGroupFullyViewed(currentUserGroup)
                    ? 'border border-white/10 bg-[#181622]'
                    : 'bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500'
                }`} />
                {/* Dark gap between ring and image */}
                <div className="absolute inset-[3px] rounded-full bg-[#0c0b11]" />
                {/* Avatar — rounded-full clips directly on the img, no overflow-hidden needed */}
                <img
                  src={avatarUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'}
                  alt="Me"
                  className="absolute rounded-full object-cover"
                  style={{ inset: '4px', width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}
                />
              </div>
            ) : (
              // Otherwise just standard avatar with plus icon, no ring
              <div
                onClick={() => setUploadModalOpen(true)}
                className="relative w-16 h-16 hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer"
              >
                <div className="absolute inset-0 rounded-full bg-[#181622] border border-white/5" />
                <img
                  src={avatarUrl || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'}
                  alt="Me"
                  className="absolute rounded-full object-cover"
                  style={{ inset: '3px', width: 'calc(100% - 6px)', height: 'calc(100% - 6px)' }}
                />
              </div>
            )}
            
            {/* Pulsing Plus Button */}
            <div 
              onClick={() => setUploadModalOpen(true)}
              className="absolute bottom-0 right-0 w-5 h-5 bg-purple-600 rounded-full border border-[#0c0b11] flex items-center justify-center text-white cursor-pointer shadow-lg shadow-purple-500/20 group-hover:scale-110 active:scale-90 transition-transform z-10"
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
                <div className="relative w-16 h-16 hover:scale-105 active:scale-95 transition-transform duration-300">
                  {/* Ring layer */}
                  <div className={`absolute inset-0 rounded-full ${
                    isGroupFullyViewed(group)
                      ? 'border border-white/10 bg-[#181622]'
                      : 'bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-500'
                  }`} />
                  {/* Dark gap */}
                  <div className="absolute inset-[3px] rounded-full bg-[#0c0b11]" />
                  {/* Avatar — rounded-full clips directly on img */}
                  <img
                    src={group.user.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'}
                    alt={group.user.nickname}
                    className="absolute rounded-full object-cover"
                    style={{ inset: '4px', width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}
                  />
                </div>
                <div className="flex flex-col items-center max-w-[76px] w-full">
                  <span 
                    className="text-[11px] font-semibold text-gray-400 group-hover:text-white transition-colors tracking-tight text-center truncate w-full"
                  >
                    <span style={getNicknameStyle(group.user.nickname_color)}>
                      {group.user.nickname}
                    </span>
                  </span>
                  <div className="flex items-center justify-center gap-0.5 mt-0.5 min-h-[16px]">
                    {group.user.is_verified && (
                      <BadgeCheck className="w-2.5 h-2.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                    )}
                    {group.user.isPro && (
                      <span className="pro-badge">
                        <Gem className="pro-badge-icon" />
                        <span className="pro-badge-text">Pro</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Stories Fullscreen Player Modal */}
      {selectedGroupIndex !== null && createPortal(
        <StoriesViewer
          groups={activeStoryGroups}
          initialGroupIndex={selectedGroupIndex}
          currentUser={currentUser}
          onClose={handleCloseViewer}
          onViewProfile={onViewProfile}
        />,
        document.body
      )}

      {/* Upload WIP Story Modal */}
      {uploadModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#12111a] border border-white/5 rounded-3xl w-full max-w-md max-h-[90vh] p-5 relative overflow-y-auto overflow-x-hidden shadow-2xl shadow-purple-500/10" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white tracking-tight">{t('add_to_story')} (WIP)</h3>
              <button 
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Media selector */}
              {previewUrl ? (
                <div 
                  className="w-[270px] h-[480px] bg-[#0c0b11] rounded-[24px] border border-white/5 flex flex-col items-center justify-center overflow-hidden relative mx-auto bg-black shadow-inner shadow-black/80 group"
                  onWheel={handleWheel}
                >
                  {selectedFile.type.startsWith('video/') ? (
                    <div 
                      onMouseDown={handlePanStart}
                      onMouseMove={handlePanMove}
                      onMouseUp={handlePanEnd}
                      onMouseLeave={handlePanEnd}
                      onTouchStart={handlePanStart}
                      onTouchMove={handlePanMove}
                      onTouchEnd={handlePanEnd}
                      className="w-full h-full absolute inset-0 overflow-hidden cursor-move"
                    >
                      <video 
                        src={previewUrl} 
                        className="w-full h-full object-cover pointer-events-none"
                        style={{
                          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                          transformOrigin: 'center center'
                        }}
                        muted 
                        loop 
                        autoPlay 
                        playsInline
                      />
                      {caption && (
                        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 pointer-events-none">
                          <span className="bg-black/60 text-white px-4 py-2 rounded-2xl text-sm font-black text-center shadow-lg border border-white/5 max-w-[85%] leading-snug">
                            {caption}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div 
                        onMouseDown={handlePanStart}
                        onMouseMove={handlePanMove}
                        onMouseUp={handlePanEnd}
                        onMouseLeave={handlePanEnd}
                        onTouchStart={handlePanStart}
                        onTouchMove={handlePanMove}
                        onTouchEnd={handlePanEnd}
                        className="w-full h-full absolute inset-0 overflow-hidden cursor-move z-0"
                        style={{ pointerEvents: editMode === 'pan' ? 'auto' : 'none' }}
                      >
                        <img 
                          src={previewUrl} 
                          alt="Preview" 
                          className="pointer-events-none max-w-none"
                          style={{
                            width: `${dimensions.w}px`,
                            height: `${dimensions.h}px`,
                            transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                            transformOrigin: 'center center',
                            position: 'absolute',
                            left: `${(270 - dimensions.w) / 2}px`,
                            top: `${(480 - dimensions.h) / 2}px`
                          }}
                        />
                      </div>

                      <canvas
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="absolute inset-0 w-full h-full z-10"
                        style={{ 
                          pointerEvents: editMode === 'draw' ? 'auto' : 'none',
                          cursor: editMode === 'draw' ? 'crosshair' : 'default'
                        }}
                      />

                      {/* Photo edit controls toolbar overlay */}
                      <div className="flex flex-col gap-2 absolute top-3 left-3 right-3 z-30 pointer-events-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between bg-black/85 p-1.5 rounded-2xl border border-white/5 shadow-xl backdrop-blur-md">
                          {/* Mode toggle */}
                          <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5">
                            <button
                              type="button"
                              onClick={() => setEditMode('pan')}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                editMode === 'pan' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              Pan/Zoom
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditMode('draw')}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                editMode === 'draw' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              Draw
                            </button>
                          </div>
                          
                          {editMode === 'draw' && (
                            <button
                              type="button"
                              onClick={clearCanvas}
                              className="px-2 py-0.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[9px] font-bold border border-red-500 active:scale-95 transition-all"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        {editMode === 'draw' && (
                          <div className="flex items-center justify-between bg-black/85 p-2 rounded-2xl border border-white/5 shadow-xl backdrop-blur-md animate-in slide-in-from-top-2 duration-300 gap-3">
                            {/* Brush Colors */}
                            <div className="flex gap-1.5">
                              {['#ffffff', '#ec4899', '#a855f7', '#eab308', '#ef4444'].map(color => (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => setBrushColor(color)}
                                  className={`w-4.5 h-4.5 rounded-full border transition-all ${
                                    brushColor === color ? 'scale-110 border-white ring-2 ring-purple-500/50' : 'border-transparent'
                                  }`}
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            {/* Brush Sizes */}
                            <div className="flex gap-1">
                              {[2, 4, 8].map(size => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => setBrushSize(size)}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-black border transition-all ${
                                    brushSize === size ? 'bg-purple-600 text-white border-purple-500' : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
                                  }`}
                                >
                                  {size === 2 ? 'Thin' : size === 4 ? 'Med' : 'Thick'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  
                  {/* Media Change trigger bubble overlay */}
                  <div 
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 px-2.5 py-1.5 rounded-xl border border-white/10 text-white text-[9px] font-bold z-20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>Change</span>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-[#0c0b11] rounded-[24px] border border-white/5 p-3 space-y-2">
                  {/* Take Photo */}
                  <button
                    type="button"
                    onClick={() => photoCaptureRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/[0.03] hover:bg-purple-500/10 border border-white/5 hover:border-purple-500/30 transition-all active:scale-95 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{t('story_take_photo')}</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{t('story_take_photo_desc')}</p>
                    </div>
                  </button>

                  {/* Record Video */}
                  <button
                    type="button"
                    onClick={() => videoCaptureRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/[0.03] hover:bg-pink-500/10 border border-white/5 hover:border-pink-500/30 transition-all active:scale-95 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-pink-500/15 flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{t('story_record_video')}</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{t('story_record_video_desc')}</p>
                    </div>
                  </button>

                  {/* Choose from Gallery */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/[0.03] hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/30 transition-all active:scale-95 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform flex-shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white">{t('story_choose_gallery')}</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{t('story_choose_gallery_desc')}</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Photo capture (camera, images only) */}
              <input
                type="file"
                ref={photoCaptureRef}
                onChange={handleFileChange}
                accept="image/*"
                capture="environment"
                className="hidden"
              />
              {/* Video capture (camera, video only) */}
              <input
                type="file"
                ref={videoCaptureRef}
                onChange={handleFileChange}
                accept="video/*"
                capture="environment"
                className="hidden"
              />
              {/* Gallery picker (any media) */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
              />

              {/* Zoom Controls */}
              {previewUrl && (
                <div className="bg-[#181622]/50 p-2.5 rounded-2xl border border-white/5 w-[270px] mx-auto">
                  <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase mb-2">
                    <span>{t('story_zoom')}</span>
                    <button
                      type="button"
                      onClick={() => { setScale(1); setPanX(0); setPanY(0) }}
                      className="text-[8px] text-purple-400/60 hover:text-purple-400 uppercase font-bold transition-colors touch-manipulation"
                    >
                      RESET
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScale(s => Math.max(0.3, parseFloat((s - 0.1).toFixed(1))))}
                      disabled={scale <= 0.3}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white text-xl font-bold transition-all active:scale-90 touch-manipulation select-none"
                    >
                      −
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-purple-400 font-black text-base">{scale.toFixed(1)}×</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScale(s => Math.min(4, parseFloat((s + 0.1).toFixed(1))))}
                      disabled={scale >= 4}
                      className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white text-xl font-bold transition-all active:scale-90 touch-manipulation select-none"
                    >
                      +
                    </button>
                  </div>
                  <div className="text-[8px] text-gray-500 text-center font-bold uppercase mt-2 leading-none">
                    Pinch to zoom · drag to pan
                  </div>
                </div>
              )}

              {/* Caption */}
              <div className="space-y-1 px-1">
                <label className="text-[10px] font-bold text-purple-400 uppercase tracking-widest px-0.5">
                  {selectedFile?.type.startsWith('video/') ? t('story_text_overlay') : t('story_caption')}
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={120}
                  rows={2}
                  className="w-full bg-[#181622] border border-white/5 focus:border-purple-500/50 focus:outline-none rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 transition-all resize-none"
                  placeholder={selectedFile?.type.startsWith('video/') ? "Type text to overlay on the video..." : "e.g. Sketching the background details..."}
                />
                <div className="text-right text-[9px] text-gray-500 font-bold px-0.5 leading-none">
                  {caption.length}/120
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:text-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-900/30"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('uploading')}
                  </>
                ) : (
                  t('publish_story')
                )}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
