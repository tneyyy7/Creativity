import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'

const isVideo = (url) => {
  if (!url) return false
  const extension = url.split('?')[0].split('.').pop().toLowerCase()
  return ['mp4', 'mov', 'webm', 'avi', 'm4v'].includes(extension)
}

const parseStoryCaptionAndTransform = (captionText) => {
  if (!captionText) return { caption: '', transformStyle: {} }
  const parts = captionText.split('___TRANSFORM:')
  const text = parts[0]
  let transformStyle = {}
  if (parts[1]) {
    try {
      const t = JSON.parse(parts[1])
      const pctX = (t.panX / 270) * 100
      const pctY = (t.panY / 480) * 100
      transformStyle = {
        transform: `translate(${pctX}%, ${pctY}%) scale(${t.scale})`,
        transformOrigin: 'center center'
      }
    } catch (e) {
      console.error("Error parsing story transform:", e)
    }
  }
  return { caption: text, transformStyle }
}

export function StoriesViewer({ groups, initialGroupIndex, onClose }) {
  const { i18n } = useTranslation()
  const [currentGroupIdx, setCurrentGroupIdx] = useState(initialGroupIndex)
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  
  const timerRef = useRef(null)
  const PROGRESS_DURATION = 5000 // 5 seconds per story
  const INTERVAL_STEP = 50 // Update progress every 50ms

  const currentGroup = groups[currentGroupIdx]
  const currentStories = currentGroup?.stories || []
  const currentStory = currentStories[currentStoryIdx]

  // Reset slide index when changing user groups
  useEffect(() => {
    setCurrentStoryIdx(0)
    setProgress(0)
  }, [currentGroupIdx])

  // Story playing loop
  useEffect(() => {
    if (!currentStory || isPaused) return

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timerRef.current)
          handleNext()
          return 0
        }
        return prev + (INTERVAL_STEP / PROGRESS_DURATION) * 100
      })
    }, INTERVAL_STEP)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentStoryIdx, currentGroupIdx, isPaused])

  const handlePrev = () => {
    setProgress(0)
    if (currentStoryIdx > 0) {
      setCurrentStoryIdx(prev => prev - 1)
    } else {
      // Go to previous user group
      if (currentGroupIdx > 0) {
        setCurrentGroupIdx(prev => prev - 1)
      } else {
        // First slide of first group: close viewer
        onClose()
      }
    }
  }

  const handleNext = () => {
    setProgress(0)
    if (currentStoryIdx < currentStories.length - 1) {
      setCurrentStoryIdx(prev => prev + 1)
    } else {
      // Go to next user group
      if (currentGroupIdx < groups.length - 1) {
        setCurrentGroupIdx(prev => prev + 1)
      } else {
        // Last slide of last group: close viewer
        onClose()
      }
    }
  }

  const togglePause = () => {
    setIsPaused(prev => !prev)
  }

  if (!currentGroup || !currentStory) return null

  // Date parsing safely
  const getRelativeTime = (dateStr) => {
    try {
      const date = new Date(dateStr)
      const currentLocale = i18n.language === 'ru' ? ru : enUS
      return formatDistanceToNow(date, { addSuffix: true, locale: currentLocale })
    } catch (e) {
      return ''
    }
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-[99] flex items-center justify-center select-none animate-in fade-in zoom-in duration-300">
      
      {/* Background blur container */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {isVideo(currentStory.image_url) ? (
          <video 
            src={currentStory.image_url} 
            className="w-full h-full object-cover scale-150 blur-3xl opacity-20"
            muted
            autoPlay
            loop
            playsInline
          />
        ) : (
          <img 
            src={currentStory.image_url} 
            alt="Blur Background" 
            className="w-full h-full object-cover scale-150 blur-3xl opacity-30"
          />
        )}
      </div>

      {/* Main player box (Aspect Ratio optimized for Stories) */}
      <div 
        className="relative w-full h-full max-w-[480px] md:h-[85vh] md:max-h-[850px] bg-[#09080d] md:rounded-[32px] overflow-hidden border border-white/5 flex flex-col justify-between shadow-[0_0_50px_rgba(147,51,234,0.15)]"
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
      >
        
        {/* Top Control Bar & Progress lines */}
        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 space-y-4">
          
          {/* Progress Indicators */}
          <div className="flex gap-1.5 w-full">
            {currentStories.map((story, index) => {
              let width = '0%'
              if (index < currentStoryIdx) width = '100%'
              if (index === currentStoryIdx) width = `${progress}%`

              return (
                <div key={story.id} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-75 rounded-full"
                    style={{ width }}
                  />
                </div>
              )
            })}
          </div>

          {/* Header (Avatar, Nickname, Time and Controls) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-purple-900/10">
                <img 
                  src={currentGroup.user.avatar_url || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=150'} 
                  alt={currentGroup.user.nickname} 
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">{currentGroup.user.nickname}</h4>
                <p className="text-[10px] text-gray-400 font-bold">{getRelativeTime(currentStory.created_at)}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {/* Play / Pause indicator */}
              <button 
                onClick={togglePause}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
              >
                {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4 fill-white" />}
              </button>

              {/* Close Button */}
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Box (WIP Image or Video) */}
        <div className="flex-1 w-full flex items-center justify-center overflow-hidden relative">
          
          {/* Previous Area Trigger (Left 1/3) */}
          <div 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-0 top-0 bottom-0 w-[30%] z-20 cursor-w-resize"
          />

          {/* Next Area Trigger (Right 1/3) */}
          <div 
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-0 top-0 bottom-0 w-[30%] z-20 cursor-e-resize"
          />

          {(() => {
            const { caption: parsedCaption, transformStyle } = parseStoryCaptionAndTransform(currentStory.caption)
            
            if (isVideo(currentStory.image_url)) {
              return (
                <>
                  <video 
                    src={currentStory.image_url} 
                    className="w-full h-full object-cover pointer-events-none"
                    style={transformStyle}
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                  {parsedCaption && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 z-10 pointer-events-none">
                      <span className="bg-black/60 text-white px-4 py-2.5 rounded-2xl text-base font-black text-center shadow-2xl border border-white/10 max-w-[85%] leading-snug animate-in zoom-in-50 duration-300">
                        {parsedCaption}
                      </span>
                    </div>
                  )}
                </>
              )
            } else {
              return (
                <img 
                  src={currentStory.image_url} 
                  alt="Story" 
                  className="w-full h-full object-cover pointer-events-none"
                />
              )
            }
          })()}
        </div>

        {/* Bottom Description Panel (Only for images) */}
        {(() => {
          const { caption: parsedCaption } = parseStoryCaptionAndTransform(currentStory.caption)
          if (!isVideo(currentStory.image_url) && parsedCaption) {
            return (
              <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-10 text-center">
                <div className="inline-block px-4 py-2.5 rounded-2xl bg-purple-950/20 backdrop-blur-md border border-purple-500/20 max-w-[90%] mx-auto shadow-lg shadow-purple-950/40">
                  <p className="text-sm font-semibold text-white tracking-tight leading-relaxed text-pretty">
                    {parsedCaption}
                  </p>
                </div>
              </div>
            )
          }
          return null
        })()}
      </div>

      {/* Desktop navigation side controls (Hidden on Mobile) */}
      <button 
        onClick={handlePrev}
        className="hidden md:flex absolute left-4 lg:left-12 w-14 h-14 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 text-white items-center justify-center active:scale-90 transition-all z-20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>

      <button 
        onClick={handleNext}
        className="hidden md:flex absolute right-4 lg:right-12 w-14 h-14 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 text-white items-center justify-center active:scale-90 transition-all z-20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
      >
        <ChevronRight className="w-8 h-8" />
      </button>

    </div>
  )
}
