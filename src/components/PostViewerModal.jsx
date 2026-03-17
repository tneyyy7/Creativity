import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Heart, MessageCircle, Send, Share2, ChevronLeft, ChevronRight, Trash2, CornerDownRight, Palette, Camera, Shapes } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchPostLikes, togglePostLike, fetchPostComments, addPostComment, deletePostComment, fetchFriends, sendMessage } from '../lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'

export function PostViewerModal({ paintings, initialIndex, currentUserId, authorProfile, onClose, onViewProfile }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0)
  const [likes, setLikes] = useState([])
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [showLikesPopup, setShowLikesPopup] = useState(false)
  const [isLiking, setIsLiking] = useState(false)
  const [isSendingComment, setIsSendingComment] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [friends, setFriends] = useState([])
  const [sharingSearch, setSharingSearch] = useState('')
  const commentInputRef = useRef(null)
  const commentsEndRef = useRef(null)

  const painting = paintings?.[currentIndex] ?? null
  const isLiked = likes.some(l => l.user_id === currentUserId)
  const isAuthor = currentUserId === authorProfile?.id

  const load = useCallback(async () => {
    if (!painting?.id) return
    try {
      const [l, c] = await Promise.all([
        fetchPostLikes(painting.id),
        fetchPostComments(painting.id)
      ])
      setLikes(Array.isArray(l) ? l : [])
      setComments(Array.isArray(c) ? c : [])
    } catch (e) {
      console.error('PostViewerModal load error:', e)
      setLikes([])
      setComments([])
    }
  }, [painting?.id])

  useEffect(() => {
    load()
    setReplyingTo(null)
    setCommentText('')
    setShowLikesPopup(false)
  }, [load])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min((paintings?.length ?? 1) - 1, i + 1))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [paintings?.length, onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleLike = async () => {
    if (!currentUserId || isLiking) return
    setIsLiking(true)
    try {
      await togglePostLike(painting.id, currentUserId)
      await load()
    } catch (e) { console.error('Like error:', e) }
    finally { setIsLiking(false) }
  }

  const handleSendComment = async () => {
    if (!commentText.trim() || isSendingComment || !currentUserId) return
    setIsSendingComment(true)
    try {
      const newComment = await addPostComment(painting.id, currentUserId, commentText.trim(), replyingTo?.id ?? null)
      if (newComment) setComments(prev => [...prev, newComment])
      setCommentText('')
      setReplyingTo(null)
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) { console.error('Comment error:', e) }
    finally { setIsSendingComment(false) }
  }

  const handleDeleteComment = async (commentId) => {
    try {
      await deletePostComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId))
    } catch (e) { console.error(e) }
  }

  const handleShareOpen = async () => {
    try {
      const f = await fetchFriends(currentUserId)
      setFriends(f || [])
      setShowShareModal(true)
    } catch (e) { console.error(e) }
  }

  const handleShareSend = async (friendProfile) => {
    if (!friendProfile || !painting) return
    try {
      const shareData = { type: 'post', painting_id: painting.id, image_url: painting.image_url, title: painting.title, author_nickname: authorProfile?.nickname, author_id: authorProfile?.id }
      await sendMessage(currentUserId, friendProfile.id, `[POST_SHARE:${JSON.stringify(shareData)}]`)
      setShowShareModal(false)
    } catch (e) { console.error(e) }
  }

  const topLevel = comments.filter(c => !c.parent_id)
  const getReplies = (parentId) => comments.filter(c => c.parent_id === parentId)

  const formatTime = (ts) => {
    try {
      const d = new Date(ts)
      const diff = Math.floor((Date.now() - d) / 1000)
      if (diff < 60) return `${diff}s`
      if (diff < 3600) return `${Math.floor(diff / 60)}m`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h`
      return d.toLocaleDateString()
    } catch { return '' }
  }

  const likeSummary = () => {
    if (!likes.length) return null
    const names = likes.slice(0, 2).map(l => l.profiles?.nickname || 'Someone')
    const rest = likes.length - names.length
    return rest > 0 ? `${names.join(', ')} and ${rest} others` : names.join(', ')
  }

  if (!painting) return null

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/95" onClick={onClose} />

      {/* Close */}
      <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 w-9 h-9 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all">
        <X className="w-5 h-5" />
      </button>

      {/* Navigation arrows — hidden on mobile, shown on desktop */}
      {currentIndex > 0 && (
        <button onClick={() => setCurrentIndex(i => i - 1)} className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full items-center justify-center transition-all">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {currentIndex < (paintings?.length ?? 1) - 1 && (
        <button onClick={() => setCurrentIndex(i => i + 1)} className="hidden md:flex absolute left-16 top-1/2 -translate-y-1/2 z-30 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full items-center justify-center transition-all">
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* MOBILE LAYOUT: vertical scroll */}
      <div className="md:hidden absolute inset-0 z-10 overflow-y-auto">
        {/* Image */}
        <div className="w-full min-h-[50vh] flex items-center justify-center bg-black pt-12 pb-2 px-2">
          <img src={painting.image_url} alt={painting.title ?? ''} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
        </div>
        {/* Mobile nav arrows */}
        <div className="flex justify-center gap-4 py-2">
          {currentIndex > 0 && (
            <button onClick={() => setCurrentIndex(i => i - 1)} className="w-9 h-9 bg-white/10 text-white rounded-full flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {currentIndex < (paintings?.length ?? 1) - 1 && (
            <button onClick={() => setCurrentIndex(i => i + 1)} className="w-9 h-9 bg-white/10 text-white rounded-full flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Info Panel (mobile) */}
        <div className="bg-[#0e0d14] rounded-t-3xl min-h-[40vh]">
          <InfoPanel
            painting={painting}
            authorProfile={authorProfile}
            likes={likes}
            comments={comments}
            topLevel={topLevel}
            getReplies={getReplies}
            isLiked={isLiked}
            isAuthor={isAuthor}
            currentUserId={currentUserId}
            showLikesPopup={showLikesPopup}
            setShowLikesPopup={setShowLikesPopup}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            commentText={commentText}
            setCommentText={setCommentText}
            commentInputRef={commentInputRef}
            commentsEndRef={commentsEndRef}
            handleLike={handleLike}
            handleSendComment={handleSendComment}
            handleDeleteComment={handleDeleteComment}
            handleShareOpen={handleShareOpen}
            likeSummary={likeSummary}
            formatTime={formatTime}
            isLiking={isLiking}
            isSendingComment={isSendingComment}
            onViewProfile={onViewProfile}
            onClose={onClose}
          />
        </div>
      </div>

      {/* DESKTOP LAYOUT: side-by-side */}
      {/* Image — fills all space except right panel */}
      <div className="hidden md:flex absolute inset-0 right-[320px] lg:right-[380px] items-center justify-center p-6" onClick={onClose}>
        <img
          src={painting.image_url}
          alt={painting.title ?? ''}
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Right panel (desktop) */}
      <div className="hidden md:flex absolute top-0 right-0 bottom-0 w-[320px] lg:w-[380px] flex-col bg-[#0e0d14] border-l border-white/5 z-20">
        <InfoPanel
          painting={painting}
          authorProfile={authorProfile}
          likes={likes}
          comments={comments}
          topLevel={topLevel}
          getReplies={getReplies}
          isLiked={isLiked}
          isAuthor={isAuthor}
          currentUserId={currentUserId}
          showLikesPopup={showLikesPopup}
          setShowLikesPopup={setShowLikesPopup}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          commentText={commentText}
          setCommentText={setCommentText}
          commentInputRef={commentInputRef}
          commentsEndRef={commentsEndRef}
          handleLike={handleLike}
          handleSendComment={handleSendComment}
          handleDeleteComment={handleDeleteComment}
          handleShareOpen={handleShareOpen}
          likeSummary={likeSummary}
          formatTime={formatTime}
          isLiking={isLiking}
          isSendingComment={isSendingComment}
          onViewProfile={onViewProfile}
          onClose={onClose}
        />
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowShareModal(false)} />
          <div className="glass-card w-full max-w-sm p-5 relative z-10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-white">Share with friends</h3>
              <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input type="text" placeholder="Search…" value={sharingSearch} onChange={e => setSharingSearch(e.target.value)} className="w-full h-10 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white outline-none mb-3" />
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
              {friends.filter(f => f?.profile && (f.profile.nickname ?? '').toLowerCase().includes(sharingSearch.toLowerCase())).map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/8 rounded-xl group">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar avatarUrl={f.profile?.avatar_url} workCount={f.profile?.finished_work_count ?? 0} size="sm" />
                    <span className="text-white font-bold text-sm notranslate" translate="no">{f.profile?.nickname}</span>
                  </div>
                  <button onClick={() => handleShareSend(f.profile)} className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {friends.length === 0 && <p className="text-center text-gray-500 py-4 text-sm">No friends found.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Shared info panel used for both mobile and desktop
function InfoPanel({ painting, authorProfile, likes, comments, topLevel, getReplies, isLiked, isAuthor, currentUserId, showLikesPopup, setShowLikesPopup, replyingTo, setReplyingTo, commentText, setCommentText, commentInputRef, commentsEndRef, handleLike, handleSendComment, handleDeleteComment, handleShareOpen, likeSummary, formatTime, isLiking, isSendingComment, onViewProfile, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col h-full">
      {/* Author */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
        <ProfileAvatar avatarUrl={authorProfile?.avatar_url} workCount={authorProfile?.finished_work_count ?? 0} size="sm" />
        <div className="flex flex-col">
          <button onClick={() => { onViewProfile?.(authorProfile?.id); onClose?.() }} className="font-black text-white hover:text-purple-400 transition-colors notranslate text-sm text-left" translate="no">
            {authorProfile?.nickname ?? 'Unknown'}
          </button>
          {authorProfile?.specialization && (
            <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest mt-0.5">
              {authorProfile.specialization === 'painter' ? <Palette className="w-2.5 h-2.5" /> : 
               authorProfile.specialization === 'photographer' ? <Camera className="w-2.5 h-2.5" /> : 
               <Shapes className="w-2.5 h-2.5" />}
              {t(authorProfile.specialization)}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {(painting.title || painting.description || painting.created_at) && (
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-white/5 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              {painting.title && <h2 className="text-white font-black text-base leading-tight uppercase tracking-tight">{painting.title}</h2>}
              {painting.created_at && (
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest shrink-0">
                  {new Date(painting.created_at).toLocaleDateString()}
                </span>
              )}
            </div>
            {painting.description && <p className="text-gray-400 text-sm leading-relaxed">{painting.description}</p>}
          </div>
        )}
        <div className="px-4 py-4 space-y-4">
          {topLevel.length === 0 && <p className="text-center text-gray-600 text-xs py-6">No comments yet. Be the first!</p>}
          {topLevel.map(comment => (
            <div key={comment.id}>
              <CommentItem comment={comment} currentUserId={currentUserId} isAuthor={isAuthor} formatTime={formatTime}
                onReply={() => { setReplyingTo({ id: comment.id, nickname: comment.profiles?.nickname ?? 'user' }); commentInputRef.current?.focus() }}
                onDelete={() => handleDeleteComment(comment.id)}
                onViewProfile={(id) => { onViewProfile?.(id); onClose?.() }}
              />
              {getReplies(comment.id).map(reply => (
                <div key={reply.id} className="ml-6 sm:ml-8 mt-2">
                  <CommentItem comment={reply} currentUserId={currentUserId} isAuthor={isAuthor} formatTime={formatTime}
                    onReply={() => { setReplyingTo({ id: comment.id, nickname: reply.profiles?.nickname ?? 'user' }); commentInputRef.current?.focus() }}
                    onDelete={() => handleDeleteComment(reply.id)}
                    onViewProfile={(id) => { onViewProfile?.(id); onClose?.() }}
                    isReply
                  />
                </div>
              ))}
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5 shrink-0">
        <div className="px-4 sm:px-5 pt-3 pb-2 flex items-center gap-5">
          <button onClick={handleLike} disabled={!currentUserId || isLiking} className={`transition-all group disabled:opacity-40 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`}>
            <Heart className={`w-6 h-6 transition-all ${isLiked ? 'fill-red-500 scale-110' : 'group-hover:scale-110'}`} />
          </button>
          <button onClick={() => commentInputRef.current?.focus()} className="text-gray-400 hover:text-white transition-colors">
            <MessageCircle className="w-6 h-6" />
          </button>
          <button onClick={handleShareOpen} className="text-gray-400 hover:text-purple-400 transition-colors">
            <Share2 className="w-6 h-6" />
          </button>
        </div>

        <div className="px-4 sm:px-5 pb-2">
          <button onClick={() => setShowLikesPopup(v => !v)} className="text-white font-black text-sm hover:text-purple-400 transition-colors">
            {likes.length} {likes.length === 1 ? 'like' : 'likes'}
          </button>
          {likeSummary() && <p className="text-gray-500 text-xs mt-0.5">💜 {likeSummary()}</p>}
          {showLikesPopup && likes.length > 0 && (
            <div className="mt-2 bg-white/5 rounded-2xl p-3 border border-white/10 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Liked by</p>
              <div className="flex flex-wrap gap-2">
                {likes.slice(0, 10).map(l => (
                  <button key={l.id} onClick={() => { onViewProfile?.(l.user_id); onClose?.() }} className="flex items-center gap-1.5 bg-white/5 hover:bg-purple-500/20 rounded-xl px-2 py-1 transition-all">
                    <ProfileAvatar avatarUrl={l.profiles?.avatar_url} workCount={l.profiles?.finished_work_count ?? 0} size="xs" />
                    <span className="text-xs text-white font-bold notranslate max-w-[70px] truncate" translate="no">{l.profiles?.nickname ?? '?'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {replyingTo && (
          <div className="px-4 py-2 bg-purple-600/10 border-t border-purple-500/20 flex items-center justify-between">
            <span className="text-xs text-purple-400 flex items-center gap-1.5">
              <CornerDownRight className="w-3 h-3" />
              Replying to <span className="font-black notranslate" translate="no">@{replyingTo.nickname}</span>
            </span>
            <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {currentUserId ? (
          <div className="px-4 py-3 flex items-center gap-3 border-t border-white/5">
            <input ref={commentInputRef} type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment() } }}
              placeholder="Add a comment…" className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none min-w-0" maxLength={500} />
            <button onClick={handleSendComment} disabled={!commentText.trim() || isSendingComment} className="text-purple-500 hover:text-purple-400 font-black text-sm disabled:opacity-30 transition-colors shrink-0">
              Post
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-white/5">
            <p className="text-xs text-gray-600 text-center">Log in to like and comment</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CommentItem({ comment, currentUserId, isAuthor, formatTime, onReply, onDelete, onViewProfile, isReply }) {
  const canDelete = currentUserId === comment.user_id || isAuthor
  return (
    <div className="flex gap-2.5 group">
      <button onClick={() => onViewProfile?.(comment.user_id)} className="shrink-0 mt-0.5">
        <ProfileAvatar avatarUrl={comment.profiles?.avatar_url} workCount={comment.profiles?.finished_work_count ?? 0} size="xs" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <button onClick={() => onViewProfile?.(comment.user_id)} className="font-black text-white text-sm hover:text-purple-400 transition-colors notranslate" translate="no">
            {comment.profiles?.nickname ?? 'Unknown'}
          </button>
          <span className="text-[10px] text-gray-600">{formatTime(comment.created_at)}</span>
        </div>
        <p className="text-gray-300 text-sm mt-0.5 leading-relaxed break-words">{comment.content}</p>
        <div className="flex items-center gap-3 mt-1">
          {!isReply && <button onClick={onReply} className="text-[11px] text-gray-600 hover:text-purple-400 transition-colors font-bold">Reply</button>}
          {canDelete && <button onClick={onDelete} className="text-[11px] text-gray-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
    </div>
  )
}
