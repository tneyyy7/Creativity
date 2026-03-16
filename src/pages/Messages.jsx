import { useState, useEffect, useRef } from 'react'
import { Send, User, MessageSquare, Search, ArrowLeft, MoreVertical, BadgeCheck, Trash2, Edit3, X as CloseIcon, Check as SaveIcon, Reply, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, sendMessage, fetchMessages, fetchConversations, markAsRead, searchFriends, deleteMessage, updateMessage, fetchPaintings, fetchPublicProfile } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { PostViewerModal } from '../components/PostViewerModal'

export function Messages({ currentUser, onViewProfile }) {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobileView, setIsMobileView] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editInput, setEditInput] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [postViewer, setPostViewer] = useState(null) // { paintings, index, authorProfile }
  const scrollRef = useRef(null)

  // Load conversations
  const loadConversations = async () => {
    const data = await fetchConversations(currentUser.id)
    setConversations(data)
    setLoading(false)
  }

  useEffect(() => {
    loadConversations()
  }, [currentUser.id])

  // Search logic
  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([])
        return
      }
      const results = await searchFriends(searchQuery, currentUser.id)
      setSearchResults(results)
    }
    const timer = setTimeout(performSearch, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, currentUser.id])

  // Load messages when active chat changes
  useEffect(() => {
    if (activeChat) {
      const loadMessages = async () => {
        const data = await fetchMessages(currentUser.id, activeChat.id)
        setMessages(data)
        markAsRead(currentUser.id, activeChat.id)
      }
      loadMessages()

      // Simplified Realtime subscription - filter in callback for reliability
      const channel = supabase
        .channel(`chat_${currentUser.id}_${activeChat.id}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events: INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newMsg = payload.new
              
              // 1. Update messages list if this is the active chat
              const isRelevant = 
                (newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeChat.id) ||
                (newMsg.sender_id === activeChat.id && newMsg.receiver_id === currentUser.id)
              
              if (isRelevant) {
                setMessages((prev) => {
                  if (prev.find(m => m.id === newMsg.id)) return prev
                  return [...prev, newMsg]
                })
                if (newMsg.receiver_id === currentUser.id) markAsRead(currentUser.id, activeChat.id)
              }

              // 2. Refresh conversation list to update unread counts and sorting
              loadConversations()
            } else if (payload.eventType === 'UPDATE') {
              const updatedMsg = payload.new
              console.log("Realtime Update Received:", updatedMsg)
              setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m))
              
              // Refresh counts if read status changed
              if (payload.old && payload.old.is_read !== payload.new.is_read) {
                loadConversations()
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id
              console.log("Realtime Delete Received for ID:", deletedId)
              setMessages(prev => prev.filter(m => m.id !== deletedId))
              loadConversations()
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [activeChat, currentUser.id])

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return
    const content = input.trim()
    setInput('')
    
    // Optimistic update
    const tempId = Date.now().toString()
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
      reply_to_id: replyingTo?.id
    }
    setMessages(prev => [...prev, optimisticMsg])
    
    const replyToId = replyingTo?.id
    setReplyingTo(null)

    try {
      const sentMsg = await sendMessage(currentUser.id, activeChat.id, content, replyToId)
      // Replace optimistic message with actual one to get proper ID/Date
      setMessages(prev => prev.map(m => m.id === tempId ? sentMsg : m))
    } catch (err) {
      console.error("Error sending message:", err)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm(t('confirm_delete_message'))) return
    try {
      // Optimistic delete
      setMessages(prev => prev.filter(m => m.id !== id))
      await deleteMessage(id)
    } catch (err) {
      console.error("Error deleting message:", err)
      // Reload on error to restore state
      const data = await fetchMessages(currentUser.id, activeChat.id)
      setMessages(data)
    }
  }

  const handleStartEdit = (msg) => {
    setEditingId(msg.id)
    setEditInput(msg.content)
  }

  const handleUpdate = async () => {
    if (!editInput.trim() || !editingId) return
    const id = editingId
    const newContent = editInput.trim()
    setEditingId(null)
    setEditInput('')
    
    try {
      // Optimistic update
      setMessages(prev => prev.map(m => m.id === id ? { ...m, content: newContent, updated_at: new Date().toISOString() } : m))
      await updateMessage(id, newContent)
    } catch (err) {
      console.error("Error updating message:", err)
      // Reload on error
      const data = await fetchMessages(currentUser.id, activeChat.id)
      setMessages(data)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <>
    <div className="h-full flex flex-col md:flex-row gap-4 md:gap-6 max-w-6xl mx-auto w-full min-h-0">
      {/* Conversations List */}
      <div className={`
        flex-col w-full md:w-80 glass-card p-4 space-y-4
        ${activeChat && isMobileView ? 'hidden' : 'flex'}
        md:flex
      `}>
        <div className="flex items-center justify-between px-2">
          <h1 className="text-2xl font-black text-white">{t('messages') || 'Messages'}</h1>
          <button 
            onClick={() => setIsSearching(!isSearching)}
            className={`p-2 rounded-lg transition-all ${isSearching ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'bg-white/5 text-purple-500 hover:bg-white/10'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>

        {isSearching && (
          <div className="px-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_friends_only') || 'Search among friends...'}
                autoFocus
                className="w-full h-11 pl-11 pr-4 bg-white/5 border border-white/5 rounded-xl focus:outline-none focus:border-purple-500/30 transition-all text-sm text-white"
              />
            </div>
          </div>
        )}

        <div className="relative px-2 hidden">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
          <input 
            type="text" 
            placeholder={t('search_chats') || 'Search conversations...'}
            className="w-full h-11 pl-11 pr-4 bg-white/5 border border-white/5 rounded-xl focus:outline-none focus:border-purple-500/30 transition-all text-sm text-white"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
          {isSearching ? (
            searchResults.length > 0 ? (
              searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => { 
                    setActiveChat(user); 
                    setIsMobileView(true); 
                    setIsSearching(false);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-gray-400 hover:bg-white/5"
                >
                  <ProfileAvatar avatarUrl={user.avatar_url} workCount={user.finished_work_count} size="sm" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-sm truncate flex items-center gap-1">
                      {user.nickname}
                      {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400" />}
                    </p>
                    <p className="text-[10px] text-purple-500 uppercase tracking-widest font-black">{t('new_chat') || 'New Chat'}</p>
                  </div>
                </button>
              ))
            ) : searchQuery.length >= 2 ? (
              <p className="text-center py-4 text-gray-600 text-xs">{t('no_users_found') || 'No artists found.'}</p>
            ) : (
              <p className="text-center py-4 text-gray-600 text-xs italic">{t('type_to_search') || 'Type nickname to search...'}</p>
            )
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">{t('no_conversations') || 'No messages yet.'}</p>
              <button 
                onClick={() => setIsSearching(true)}
                className="mt-4 text-purple-500 text-xs font-bold uppercase tracking-widest hover:text-purple-400 transition-colors"
              >
                + {t('start_new_chat') || 'Start new chat'}
              </button>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { setActiveChat(conv); setIsMobileView(true); }}
                className={`
                  w-full flex items-center gap-3 p-3 rounded-xl transition-all relative
                  ${activeChat?.id === conv.id ? 'bg-purple-600/10 text-white' : 'text-gray-400 hover:bg-white/5'}
                `}
              >
                <ProfileAvatar avatarUrl={conv.avatar_url} workCount={conv.finished_work_count} size="sm" />
                <div className="flex-1 text-left min-w-0">
                  <p className="font-bold text-sm truncate flex items-center gap-1">
                    {conv.nickname}
                    {conv.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400" />}
                  </p>
                  <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-purple-400 font-bold' : 'text-gray-500'}`}>
                    {conv.unread_count > 0 ? t('new_messages') || 'New messages' : (t('click_to_chat') || 'Click to chat')}
                  </p>
                </div>
                {conv.unread_count > 0 && activeChat?.id !== conv.id && (
                  <div className="w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-red-500/40">
                    {conv.unread_count > 9 ? '9+' : conv.unread_count}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`
        flex-1 glass-card flex flex-col relative overflow-hidden
        ${!activeChat && isMobileView ? 'hidden' : 'flex'}
        ${!activeChat ? 'hidden md:flex items-center justify-center' : 'flex'}
      `}>
        {!activeChat ? (
          <div className="text-center space-y-4 opacity-40">
            <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto">
              <MessageSquare className="w-10 h-10 text-gray-500" />
            </div>
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Select a chat to start</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-white/[0.02]">
              <button 
                onClick={() => setIsMobileView(false)}
                className="md:hidden p-2 text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => onViewProfile(activeChat.id)}
                className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
              >
                <ProfileAvatar avatarUrl={activeChat.avatar_url} workCount={activeChat.finished_work_count} size="sm" />
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    {activeChat.nickname}
                    {activeChat.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400" />}
                  </h3>
                  <p className="text-[10px] text-purple-500 font-black uppercase tracking-widest">Active Chat</p>
                </div>
              </button>
              <button className="p-2 text-gray-500 hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar"
            >
              {messages.map((msg, i) => (
                <div 
                  key={msg.id || i}
                  className={`flex group ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    max-w-[85%] sm:max-w-[70%] md:max-w-[55%] relative p-4 rounded-2xl md:rounded-[1.5rem] text-sm md:text-[15px] font-medium shadow-xl transition-all
                    ${msg.sender_id === currentUser.id 
                      ? 'bg-purple-600 text-white rounded-tr-none ml-auto' 
                      : 'bg-white/10 text-gray-200 rounded-tl-none border border-white/5 mr-auto'}
                    ${editingId === msg.id ? 'ring-2 ring-purple-400/50 min-w-[240px]' : ''}
                  `}>
                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-3">
                        <textarea
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 focus:border-purple-300 focus:ring-0 text-white p-3 min-h-[80px] resize-none rounded-xl text-sm leading-relaxed"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleUpdate()
                            }
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                        />
                        <div className="flex justify-end items-center gap-3">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold transition-all"
                          >
                            <CloseIcon className="w-3.5 h-3.5" />
                            {t('cancel') || 'Cancel'}
                          </button>
                          <button 
                            onClick={handleUpdate} 
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-purple-600 hover:bg-purple-50 text-xs font-black rounded-lg transition-all shadow-lg"
                          >
                            <SaveIcon className="w-3.5 h-3.5" />
                            {t('save') || 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.reply_to_id && (
                          <div className="mb-2 p-2 bg-black/20 rounded-lg border-l-2 border-purple-400/50 text-xs opacity-80 max-w-full truncate flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-purple-300/70 mb-1">{messages.find(m => m.id === msg.reply_to_id)?.sender_id === currentUser.id ? t('you') || 'You' : activeChat.nickname}</span>
                            <span className="truncate italic">"{messages.find(m => m.id === msg.reply_to_id)?.content || t('message_deleted')}"</span>
                          </div>
                        )}
                        {msg.content?.startsWith('[PROFILE_SHARE:') ? (() => {
                          try {
                            const data = JSON.parse(msg.content.replace('[PROFILE_SHARE:', '').replace(']', ''))
                            return (
                              <div className="py-2 space-y-4">
                                <div className="flex flex-col items-center text-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
                                  <ProfileAvatar avatarUrl={data.avatar_url} workCount={data.work_count} size="lg" />
                                  <div>
                                    <h4 className="font-black text-white text-lg flex items-center justify-center gap-1.5 notranslate" translate="no">
                                      {data.nickname}
                                      {data.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                                    </h4>
                                    <p className="text-[10px] text-purple-400 font-bold uppercase tracking-[0.2em] mt-1">{t('artist_profile')}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => onViewProfile?.(data.id)}
                                  className="w-full py-3 bg-white text-purple-600 font-black rounded-xl hover:bg-purple-50 transition-all shadow-lg active:scale-95"
                                >
                                  {t('view_profile')}
                                </button>
                              </div>
                            )
                          } catch (e) {
                            return msg.content
                          }
                        })() : msg.content?.startsWith('[POST_SHARE:') ? (() => {
                          try {
                            const data = JSON.parse(msg.content.slice('[POST_SHARE:'.length, -1))
                            return (
                              <div
                                className="py-2 cursor-pointer"
                                onClick={async () => {
                                  try {
                                    const paintings = await fetchPaintings(data.author_id)
                                    const finished = (paintings || []).filter(p => p && p.is_finished)
                                    const idx = finished.findIndex(p => p.id === data.painting_id)
                                    const profile = await fetchPublicProfile(data.author_id)
                                    setPostViewer({
                                      paintings: finished,
                                      index: idx >= 0 ? idx : 0,
                                      authorProfile: profile
                                    })
                                  } catch (e) { console.error('Open post error:', e) }
                                }}
                              >
                                <div className="bg-black/20 rounded-2xl overflow-hidden border border-white/5">
                                  {data.image_url && (
                                    <img
                                      src={data.image_url}
                                      alt={data.title || 'artwork'}
                                      className="w-full max-h-48 object-cover"
                                    />
                                  )}
                                  <div className="p-3">
                                    {data.title && <p className="text-white font-black text-sm">{data.title}</p>}
                                    {data.author_nickname && (
                                      <p className="text-[10px] text-purple-300/70 font-bold uppercase tracking-widest mt-0.5">
                                        by {data.author_nickname}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          } catch (e) {
                            return msg.content
                          }
                        })() : msg.content}
                        <div className="flex items-center justify-between mt-2 gap-4">
                           <span className="text-[9px] opacity-50">
                             {msg.updated_at && msg.updated_at !== msg.created_at ? `(${t('edited')}) ` : ''}
                             {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </span>
                            {msg.sender_id === currentUser.id ? (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setReplyingTo(msg)} className="p-1 hover:text-purple-300 transition-colors" title={t('reply') || 'Reply'}>
                                  <Reply className="w-3.5 h-3.5" />
                                </button>
                                {!msg.content?.startsWith('[PROFILE_SHARE:') && !msg.content?.startsWith('[POST_SHARE:') && (
                                  <button onClick={() => handleStartEdit(msg)} className="p-1 hover:text-purple-300 transition-colors">
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button onClick={() => handleDelete(msg.id)} className="p-1 hover:text-red-400 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setReplyingTo(msg)} className="p-1 hover:text-purple-300 transition-colors" title={t('reply') || 'Reply'}>
                                  <Reply className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/[0.02] border-t border-white/5">
              {replyingTo && (
                <div className="mb-3 p-3 bg-purple-600/10 rounded-xl border border-purple-500/20 flex items-center justify-between animate-in slide-in-from-bottom-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">{t('replying_to')}</p>
                    <p className="text-xs text-gray-300 truncate italic">"{replyingTo.content}"</p>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="relative group">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={t('type_message') || 'Type a message...'}
                  className="w-full h-14 pl-6 pr-16 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500/30 text-white font-medium placeholder:text-gray-600"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="absolute right-2 top-2 w-10 h-10 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shadow-lg"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {/* Post Viewer Modal */}
    {postViewer && postViewer.paintings?.length > 0 && (
      <PostViewerModal
        paintings={postViewer.paintings}
        initialIndex={postViewer.index}
        currentUserId={currentUser?.id}
        authorProfile={postViewer.authorProfile}
        onClose={() => setPostViewer(null)}
        onViewProfile={onViewProfile}
      />
    )}
    </>
  )
}
