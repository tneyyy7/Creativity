import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Play, Pause, Heart, Volume2, VolumeX, Send, Loader2, Check, MoreVertical, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { checkIfStoryLiked, toggleStoryLike, sendMessage, deleteStory } from '../lib/supabase'

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

export function StoriesViewer({ groups, initialGroupIndex, currentUser, onClose }) {
  const { t, i18n } = useTranslation()
  const [currentGroupIdx, setCurrentGroupIdx] = useState(initialGroupIndex)
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  
  // More options menu states
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const timerRef = useRef(null)
  const PROGRESS_DURATION = 5000 // 5 seconds per story
  const INTERVAL_STEP = 50 // Update progress every 50ms

  const currentGroup = groups[currentGroupIdx]
  const currentStories = currentGroup?.stories || []
  const currentStory = currentStories[currentStoryIdx]

  // Reset slide index and menu states when changing user groups or stories
  useEffect(() => {
    setCurrentStoryIdx(0)
    setProgress(0)
    setShowMoreMenu(false)
  }, [currentGroupIdx])

  useEffect(() => {
    setProgress(0)
    setShowMoreMenu(false)
  }, [currentStoryIdx])

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

  // Story enhancements states
  const [isMuted, setIsMuted] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isSendingComment, setIsSendingComment] = useState(false)
  const [showReplySuccess, setShowReplySuccess] = useState(false)

  // Fetch like status when currentStory or currentUser changes
  useEffect(() => {
    if (currentUser && currentStory) {
      checkIfStoryLiked(currentStory.id, currentUser.id).then(liked => {
        setIsLiked(liked)
      })
    } else {
      setIsLiked(false)
    }
  }, [currentStory?.id, currentUser?.id])

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

  const handleLikeToggle = async (e) => {
    if (e) e.stopPropagation();
    if (!currentUser || !currentStory) return
    
    const nextLiked = !isLiked
    setIsLiked(nextLiked) // Optimistic update
    
    try {
      const result = await toggleStoryLike(currentStory.id, currentUser.id)
      setIsLiked(result)
    } catch (err) {
      console.error("Story Like error:", err)
      setIsLiked(!nextLiked) // Revert on failure
    }
  }

  const handleCommentSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!commentText.trim() || !currentUser || !currentStory || isSendingComment) return
    
    setIsSendingComment(true)
    setIsPaused(true)
    
    const storyOwnerId = currentGroup.user.id
    const captionText = currentStory.caption || ''
    const commentMsg = commentText.trim()
    
    try {
      // Create the direct message story share payload
      const sharePayload = JSON.stringify({
        story_id: currentStory.id,
        image_url: currentStory.image_url,
        caption: captionText.split('___TRANSFORM:')[0], // strip transform tags from DM preview
        comment: commentMsg
      })
      
      await sendMessage(currentUser.id, storyOwnerId, `[STORY_SHARE:${sharePayload}]`)
      
      // Trigger clear and success feedback
      setCommentText('')
      setShowReplySuccess(true)
      setTimeout(() => setShowReplySuccess(false), 2500)
    } catch (err) {
      console.error("Story DM Reply error:", err)
      alert("Не удалось отправить ответ")
    } finally {
      setIsSendingComment(false)
      setIsPaused(false)
    }
  }

  const handleDelete = async (e) => {
    if (e) e.stopPropagation();
    if (!currentUser || !currentStory || isDeleting) return

    const confirmMsg = i18n.language === 'ru' 
      ? 'Вы уверены, что хотите удалить эту историю?' 
      : 'Are you sure you want to delete this story?'
      
    if (window.confirm(confirmMsg)) {
      setIsDeleting(true)
      try {
        await deleteStory(currentStory.id)
        setShowMoreMenu(false)
        onClose() // Close story viewer to reload banner groups
      } catch (err) {
        console.error("Story deletion error:", err)
        alert(i18n.language === 'ru' ? 'Не удалось удалить историю' : 'Failed to delete story')
      } finally {
        setIsDeleting(false)
      }
    }
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
        onTouchStart={() => { if (!showMoreMenu) setIsPaused(true); }}
        onTouchEnd={() => { if (!showMoreMenu) setIsPaused(false); }}
        onMouseDown={() => { if (!showMoreMenu) setIsPaused(true); }}
        onMouseUp={() => { if (!showMoreMenu) setIsPaused(false); }}
      >
        
        {/* Click-away overlay for options menu */}
        {showMoreMenu && (
          <div 
            className="absolute inset-0 bg-transparent z-40 cursor-default" 
            onClick={(e) => {
              e.stopPropagation();
              setShowMoreMenu(false);
              setIsPaused(false);
            }}
          />
        )}
        
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
              {/* Volume Control Button */}
              {isVideo(currentStory.image_url) && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}

              {/* Play / Pause indicator */}
              <button 
                onClick={togglePause}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all text-white"
              >
                {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4 fill-white" />}
              </button>

              {/* Options Menu (Three dots) for Story Owner */}
              {currentUser && currentUser.id === currentGroup.user.id && (
                <div className="relative z-50">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setShowMoreMenu(!showMoreMenu); 
                      setIsPaused(!showMoreMenu); // pause if opening, resume if closing
                    }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-95 transition-all text-white ${
                      showMoreMenu ? 'bg-purple-600 shadow-lg shadow-purple-900/40' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showMoreMenu && (
                    <div className="absolute right-0 top-10 bg-[#12111a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 w-40 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-black text-red-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-all disabled:opacity-50"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>{isDeleting ? (i18n.language === 'ru' ? 'Удаление...' : 'Deleting...') : (i18n.language === 'ru' ? 'Удалить' : 'Delete')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                    muted={isMuted}
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

        {/* Success Toast for story replies */}
        {showReplySuccess && (
          <div className="absolute inset-x-0 bottom-24 flex justify-center z-40 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <span className="bg-purple-600 text-white px-4 py-2 rounded-2xl text-xs font-black shadow-2xl border border-purple-500/30 backdrop-blur-md flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              Ответ отправлен в чат!
            </span>
          </div>
        )}

        {/* Bottom Description & Interactive bar */}
        <div className="z-30 w-full bg-gradient-to-t from-black via-black/95 to-transparent p-4 space-y-4">
          {(() => {
            const { caption: parsedCaption } = parseStoryCaptionAndTransform(currentStory.caption)
            if (!isVideo(currentStory.image_url) && parsedCaption) {
              return (
                <div className="text-center px-2">
                  <div className="inline-block px-4 py-2 rounded-2xl bg-purple-950/20 backdrop-blur-md border border-purple-500/20 max-w-[90%] mx-auto shadow-md">
                    <p className="text-xs font-semibold text-white tracking-tight leading-relaxed text-pretty">
                      {parsedCaption}
                    </p>
                  </div>
                </div>
              )
            }
            return null
          })()}

          {currentUser && currentUser.id !== currentGroup.user.id && (
            <div className="flex items-center gap-3 w-full" onClick={e => e.stopPropagation()}>
              <form onSubmit={handleCommentSubmit} className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => { if (!isSendingComment) setIsPaused(false); }}
                  placeholder="Ответить на историю..."
                  className="flex-1 bg-white/5 border border-white/10 hover:border-white/20 focus:border-purple-500/50 rounded-full px-4 py-2 text-xs text-white placeholder-gray-500 transition-all focus:outline-none backdrop-blur-md"
                />
                {commentText.trim() && (
                  <button
                    type="submit"
                    disabled={isSendingComment}
                    className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white active:scale-95 transition-all"
                  >
                    {isSendingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                )}
              </form>

              <button
                onClick={handleLikeToggle}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all active:scale-75 group flex-shrink-0"
              >
                <Heart 
                  className={`w-4 h-4 transition-all duration-300 ${
                    isLiked 
                      ? 'text-red-500 fill-red-500 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.6)] scale-110' 
                      : 'text-gray-400 group-hover:text-white'
                  }`} 
                />
              </button>
            </div>
          )}
        </div>
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
