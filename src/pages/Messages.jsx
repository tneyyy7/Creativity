import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Send, User, MessageSquare, Search, ArrowLeft, MoreVertical, BadgeCheck, Trash2, Edit3, X as CloseIcon, Check as SaveIcon, Reply, X, Palette, Camera, Shapes, Smile, Gem, Box, PenTool } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, sendMessage, fetchMessages, fetchConversations, markAsRead, searchFriends, deleteMessage, updateMessage, fetchPaintings, fetchPublicProfile, fetchCustomEmojis, fetchProProfileSettings, fetchChatTheme, saveChatTheme } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { PostViewerModal } from '../components/PostViewerModal'
import { getNicknameStyle } from '../lib/nicknameStyle'

export function Messages({ currentUser, isPro, onViewProfile }) {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobileView, setIsMobileView] = useState(false)
  // Tracks whether we are on a phone-sized viewport (Tailwind's md breakpoint = 768px).
  // On phones the open chat is rendered as a full-screen overlay for a real messenger feel.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Track the visual viewport height so the full-screen chat shrinks when the
  // on-screen keyboard opens, keeping the input field visible above it.
  const [viewportHeight, setViewportHeight] = useState(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setViewportHeight(vv.height)
    vv.addEventListener('resize', onResize)
    onResize()
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  const isOnline = (lastSeen) => {
    if (!lastSeen) return false
    return (Date.now() - new Date(lastSeen).getTime()) < 2 * 60 * 1000
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editInput, setEditInput] = useState('')
  const [replyingTo, setReplyingTo] = useState(null)
  const [postViewer, setPostViewer] = useState(null) // { paintings, index, authorProfile }
  const scrollRef = useRef(null)

  // Emoji States and Functions
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [customEmojis, setCustomEmojis] = useState([])
  const [loadingCustomEmojis, setLoadingCustomEmojis] = useState(false)
  const [activeEmojiTab, setActiveEmojiTab] = useState('standard') // 'standard' | 'custom'
  const emojiPickerRef = useRef(null)

  // Pro Chat Theme States and Styles
  const [chatTheme, setChatTheme] = useState('default')
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const themeMenuRef = useRef(null)

  // Click outside to close theme popup
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setShowThemeMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [themeMenuRef])

  // Load theme for active chat
  useEffect(() => {
    if (currentUser?.id && activeChat?.id && isPro) {
      fetchChatTheme(currentUser.id, activeChat.id)
        .then((theme) => {
          setChatTheme(theme)
        })
        .catch(err => console.error("Error loading chat theme:", err))
    } else {
      setChatTheme('default')
    }
  }, [currentUser?.id, activeChat?.id, isPro])

  const THEME_STYLES = {
    default: {
      bg: 'bg-transparent',
      myBubble: 'bg-purple-600 text-white',
      theirBubble: 'bg-white/10 text-gray-200 border border-white/5'
    },
    dark_space: {
      bg: 'bg-gradient-to-b from-[#0a051b] via-[#040209] to-[#0b031d]',
      myBubble: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30',
      theirBubble: 'bg-slate-900/80 text-slate-100 border border-indigo-500/20'
    },
    cyberpunk: {
      bg: 'bg-[#050508] bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:16px_16px]',
      myBubble: 'bg-yellow-500 text-black font-black border-2 border-cyan-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]',
      theirBubble: 'bg-[#0f0e17] text-cyan-400 border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
    },
    rose_gold: {
      bg: 'bg-gradient-to-br from-[#1c1216] via-[#10090c] to-[#25151c]',
      myBubble: 'bg-rose-400/95 text-neutral-950 font-bold border border-rose-300 shadow-[0_0_15px_rgba(251,113,133,0.25)]',
      theirBubble: 'bg-[#1c1216]/90 text-rose-300 border border-rose-900/30'
    },
    sunset_glow: {
      bg: 'bg-gradient-to-tr from-[#1a0c18] via-[#09050d] to-[#2b0e12]',
      myBubble: 'bg-gradient-to-r from-amber-500 to-rose-500 text-white border border-rose-400/20 shadow-[0_0_15px_rgba(244,63,94,0.3)]',
      theirBubble: 'bg-neutral-900/90 text-orange-200 border border-orange-500/10'
    }
  }

  const activeTheme = THEME_STYLES[chatTheme] || THEME_STYLES.default

  useEffect(() => {
    if (currentUser?.id && isPro) {
      const loadCustomEmojis = async () => {
        try {
          setLoadingCustomEmojis(true)
          const data = await fetchCustomEmojis(currentUser.id)
          setCustomEmojis(data || [])
        } catch (e) {
          console.error("Error loading custom emojis for chat:", e)
        } finally {
          setLoadingCustomEmojis(false)
        }
      }
      loadCustomEmojis()
    }
  }, [currentUser?.id, isPro])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAddEmoji = (emoji) => {
    setInput(prev => prev + emoji)
  }

  const handleAddCustomEmoji = (emoji) => {
    // Insert a short, readable shortcode instead of the long raw URL tag.
    // It is expanded back to the full [EMOJI:url:name] tag right before sending.
    setInput(prev => prev + `:${emoji.name}:`)
    setShowEmojiPicker(false)
  }

  // Convert :name: shortcodes into full [EMOJI:url:name] tags for storage/rendering.
  const expandEmojiShortcodes = (text) => {
    if (!text) return text
    return text.replace(/:([a-z0-9_]{2,20}):/g, (full, name) => {
      const emoji = customEmojis.find((e) => e.name === name)
      return emoji ? `[EMOJI:${emoji.image_url}:${name}]` : full
    })
  }

  const parseMessageContent = (content) => {
    if (!content) return ''
    
    // Regular expression for custom emojis [EMOJI:url:name]
    const emojiRegex = /\[EMOJI:(https?:\/\/[^:]+):([^\]]+)\]/g
    
    const parts = []
    let lastIndex = 0
    let match
    
    while ((match = emojiRegex.exec(content)) !== null) {
      const [fullMatch, url, name] = match
      const index = match.index
      
      if (index > lastIndex) {
        parts.push(content.substring(lastIndex, index))
      }
      
      parts.push(
        <img
          key={`${url}-${index}`}
          src={url}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="inline-block w-8 h-8 mx-0.5 object-contain align-middle select-none animate-in fade-in zoom-in-50 duration-200"
        />
      )
      
      lastIndex = emojiRegex.lastIndex
    }
    
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex))
    }
    
    return parts.length > 0 ? parts : content
  }

  const cleanEmojiTags = (content) => {
    if (!content) return ''
    return content.replace(/\[EMOJI:https?:\/\/[^:]+:([^\]]+)\]/g, ':$1:')
  }

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

  // Scroll to bottom on new messages and when the keyboard resizes the viewport
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, viewportHeight])

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return
    const content = expandEmojiShortcodes(input.trim())
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
    const newContent = expandEmojiShortcodes(editInput.trim())
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
                    <ProfileAvatar avatarUrl={user.avatar_url} workCount={user.finished_work_count} size="sm" isOnline={isOnline(user.last_seen)} isPro={user.isPro} avatarFrame={user.avatar_frame} />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-bold text-sm truncate flex items-center gap-1.5" style={getNicknameStyle(user.nickname_color, '#fff')}>
                        {user.nickname}
                        {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                        {user.isPro && (
                          <span className="pro-badge">
                            <Gem className="pro-badge-icon" />
                            <span className="pro-badge-text">Pro</span>
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-purple-500 uppercase tracking-widest font-black leading-none">{t('new_chat') || 'New Chat'}</p>
                        {user.specialization && (
                          <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest leading-none border-l border-white/10 pl-2">
                            {user.specialization === 'painter' ? <Palette className="w-2.5 h-2.5" /> :
                             user.specialization === 'photographer' ? <Camera className="w-2.5 h-2.5" /> :
                             user.specialization === '3D' ? <Box className="w-2.5 h-2.5" /> :
                             user.specialization === 'designer' ? <PenTool className="w-2.5 h-2.5" /> :
                             <Shapes className="w-2.5 h-2.5" />}
                            {t(user.specialization)}
                          </span>
                        )}
                      </div>
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
                  <ProfileAvatar avatarUrl={conv.avatar_url} workCount={conv.finished_work_count} size="sm" isOnline={isOnline(conv.last_seen)} isPro={conv.isPro} avatarFrame={conv.avatar_frame} />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-sm truncate flex items-center gap-1.5" style={getNicknameStyle(conv.nickname_color, '#fff')}>
                      {conv.nickname}
                      {conv.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                      {conv.isPro && (
                        <span className="pro-badge">
                          <Gem className="pro-badge-icon" />
                          <span className="pro-badge-text">Pro</span>
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className={`text-[10px] truncate leading-none ${conv.unread_count > 0 ? 'text-purple-400 font-bold' : 'text-gray-500'}`}>
                        {conv.unread_count > 0 ? t('new_messages') || 'New messages' : (t('click_to_chat') || 'Click to chat')}
                      </p>
                      {conv.specialization && (
                        <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest leading-none border-l border-white/10 pl-2">
                          {conv.specialization === 'painter' ? <Palette className="w-2.5 h-2.5" /> :
                           conv.specialization === 'photographer' ? <Camera className="w-2.5 h-2.5" /> :
                           conv.specialization === '3D' ? <Box className="w-2.5 h-2.5" /> :
                           conv.specialization === 'designer' ? <PenTool className="w-2.5 h-2.5" /> :
                           <Shapes className="w-2.5 h-2.5" />}
                          {t(conv.specialization)}
                        </span>
                      )}
                    </div>
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

        {/* Chat Window: inline panel on desktop, full-screen overlay on phones */}
        {(() => {
          const isFullscreen = isMobile && activeChat
          const panel = (
            <div
              style={isFullscreen ? { height: viewportHeight ? `${viewportHeight}px` : '100dvh' } : undefined}
              className={
                isFullscreen
                  ? 'fixed inset-0 z-[90] flex flex-col bg-[#0a0a0a] overscroll-contain'
                  : `flex-1 glass-card flex-col relative overflow-hidden ${activeChat && isMobileView ? 'flex' : 'hidden md:flex'} ${!activeChat ? 'items-center justify-center' : ''}`
              }
            >
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
              <div
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
                className="p-4 border-b border-white/5 flex items-center gap-4 bg-white/[0.02] flex-shrink-0"
              >
                <button
                  onClick={() => { setIsMobileView(false); setActiveChat(null); }}
                  className="md:hidden p-2 text-gray-400 hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onViewProfile(activeChat.id)}
                  className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                >
                  <ProfileAvatar avatarUrl={activeChat.avatar_url} workCount={activeChat.finished_work_count} size="sm" isOnline={isOnline(activeChat.last_seen)} isPro={activeChat.isPro} avatarFrame={activeChat.avatar_frame} />
                  <div className="flex-1 text-left">
                    <h3 className="font-bold text-white flex items-center gap-1.5" style={getNicknameStyle(activeChat.nickname_color)}>
                      {activeChat.nickname}
                      {activeChat.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                      {activeChat.isPro && (
                        <span className="pro-badge">
                          <Gem className="pro-badge-icon" />
                          <span className="pro-badge-text">Pro</span>
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-purple-500 font-black uppercase tracking-widest leading-none">Active Chat</p>
                      {activeChat.specialization && (
                        <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest leading-none border-l border-white/10 pl-2">
                          {activeChat.specialization === 'painter' ? <Palette className="w-2.5 h-2.5" /> :
                           activeChat.specialization === 'photographer' ? <Camera className="w-2.5 h-2.5" /> :
                           activeChat.specialization === '3D' ? <Box className="w-2.5 h-2.5" /> :
                           activeChat.specialization === 'designer' ? <PenTool className="w-2.5 h-2.5" /> :
                           <Shapes className="w-2.5 h-2.5" />}
                          {t(activeChat.specialization)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="relative" ref={themeMenuRef}>
                  <button 
                    onClick={() => setShowThemeMenu(prev => !prev)}
                    className="p-2 text-gray-500 hover:text-white transition-colors rounded-xl hover:bg-white/5"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  
                  {showThemeMenu && (
                    <div className="absolute right-0 top-11 z-[100] w-56 bg-[#121214] border border-white/10 p-3 shadow-2xl rounded-2xl animate-in fade-in slide-in-from-top-3 duration-200">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('chat_theme_label')}</span>
                        <CloseIcon className="w-3.5 h-3.5 text-gray-500 hover:text-white cursor-pointer" onClick={() => setShowThemeMenu(false)} />
                      </div>
                      
                      {isPro ? (
                        <div className="space-y-1">
                          {Object.keys(THEME_STYLES).map((themeKey) => {
                            const name = t('chat_theme_' + themeKey)
                            return (
                              <button
                                key={themeKey}
                                onClick={async () => {
                                  try {
                                    setChatTheme(themeKey)
                                    await saveChatTheme(currentUser.id, activeChat.id, themeKey)
                                    setShowThemeMenu(false)
                                  } catch (err) {
                                    console.error('Error saving chat theme:', err)
                                  }
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                                  chatTheme === themeKey 
                                    ? 'bg-purple-600 text-white' 
                                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                <span>{name}</span>
                                {chatTheme === themeKey && <SaveIcon className="w-3.5 h-3.5 text-white" />}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="p-3 text-center space-y-2">
                          <Gem className="w-6 h-6 text-cyan-400 animate-pulse mx-auto" />
                          <p className="text-[10px] text-gray-400 leading-normal font-bold">
                            {t('chat_theme_pro_only')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Area */}
              <div
                ref={scrollRef}
                className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar transition-all duration-500 ${activeTheme.bg}`}
              >
                {messages.map((msg, i) => (
                  <div
                    key={msg.id || i}
                    className={`flex group ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                    max-w-[85%] sm:max-w-[70%] md:max-w-[55%] relative p-4 rounded-2xl md:rounded-[1.5rem] text-sm md:text-[15px] font-medium shadow-xl transition-all
                    ${msg.sender_id === currentUser.id
                        ? `${activeTheme.myBubble} rounded-tr-none ml-auto`
                        : `${activeTheme.theirBubble} rounded-tl-none mr-auto`}
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
                              <span className="truncate italic">"{cleanEmojiTags(messages.find(m => m.id === msg.reply_to_id)?.content) || t('message_deleted')}"</span>
                            </div>
                          )}
                          {msg.content?.startsWith('[PROFILE_SHARE:') ? (() => {
                            try {
                              const data = JSON.parse(msg.content.replace('[PROFILE_SHARE:', '').replace(']', ''))
                              return (
                                <div className="py-2 space-y-4">
                                  <div className="flex flex-col items-center text-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
                                    <ProfileAvatar avatarUrl={data.avatar_url} workCount={data.work_count} size="lg" isPro={data.isPro} avatarFrame={data.avatar_frame} />
                                    <div>
                                      <h4 className="font-black text-white text-lg flex items-center justify-center gap-1.5 notranslate" translate="no" style={getNicknameStyle(data.nickname_color)}>
                                        {data.nickname}
                                        {data.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                                        {data.isPro && (
                                          <span className="pro-badge">
                                            <Gem className="pro-badge-icon" />
                                            <span className="pro-badge-text">Pro</span>
                                          </span>
                                        )}
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
                          })() : msg.content?.startsWith('[STORY_SHARE:') ? (() => {
                            try {
                              const data = JSON.parse(msg.content.slice('[STORY_SHARE:'.length, -1))
                              const isVid = data.image_url && ['mp4', 'mov', 'webm', 'avi', 'm4v'].includes(data.image_url.split('?')[0].split('.').pop().toLowerCase())
                              return (
                                <div className="py-1.5 space-y-2.5 max-w-[260px]">
                                  <div className="bg-black/30 rounded-2xl overflow-hidden border border-white/5 p-2 flex gap-3 items-center backdrop-blur-md">
                                    {data.image_url && (
                                      <div className="w-14 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-white/10 bg-black flex items-center justify-center">
                                        {isVid ? (
                                          <video src={data.image_url} className="w-full h-full object-cover" muted playsInline autoPlay loop />
                                        ) : (
                                          <img src={data.image_url} alt="" className="w-full h-full object-cover" />
                                        )}
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[9px] text-purple-300 font-black uppercase tracking-wider">{t('reply_to_story', 'Ответ на историю')}</p>
                                      {data.caption && <p className="text-gray-400 text-[10px] italic truncate mt-0.5">"{data.caption}"</p>}
                                    </div>
                                  </div>
                                  {data.comment && (
                                    <p className="text-white text-xs leading-relaxed px-1 font-medium">{data.comment}</p>
                                  )}
                                </div>
                              )
                            } catch (e) {
                              return msg.content
                            }
                          })() : parseMessageContent(msg.content)}
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
              <div
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                className="p-4 bg-white/[0.02] border-t border-white/5 flex-shrink-0"
              >
                {replyingTo && (
                  <div className="mb-3 p-3 bg-purple-600/10 rounded-xl border border-purple-500/20 flex items-center justify-between animate-in slide-in-from-bottom-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">{t('replying_to')}</p>
                      <p className="text-xs text-gray-300 truncate italic">"{cleanEmojiTags(replyingTo.content)}"</p>
                    </div>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {expandEmojiShortcodes(input).includes('[EMOJI:') && (
                  <div className="mb-3 p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-bottom-2">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest shrink-0">{t('preview', 'Превью')}</span>
                    <div className="text-sm text-gray-200 flex items-center flex-wrap leading-relaxed break-words min-w-0">
                      {parseMessageContent(expandEmojiShortcodes(input))}
                    </div>
                  </div>
                )}
                <div className="relative flex items-center gap-2">
                  {/* Emoji Picker Popover */}
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute bottom-16 left-0 w-80 max-h-80 bg-[#121214] border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 z-50 animate-in slide-in-from-bottom-3 duration-200"
                    >
                      {/* Tabs Header */}
                      <div className="flex border-b border-white/5 pb-2">
                        <button
                          type="button"
                          onClick={() => setActiveEmojiTab('standard')}
                          className={`flex-1 pb-1.5 text-xs font-black uppercase tracking-wider text-center transition-all border-b ${
                            activeEmojiTab === 'standard'
                              ? 'text-purple-400 border-purple-500'
                              : 'text-gray-500 border-transparent hover:text-gray-300'
                          }`}
                        >
                          {t('standard_emojis', 'Стандартные')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveEmojiTab('custom')}
                          className={`flex-1 pb-1.5 text-xs font-black uppercase tracking-wider text-center transition-all border-b flex items-center justify-center gap-1.5 ${
                            activeEmojiTab === 'custom'
                              ? 'text-purple-400 border-purple-500'
                              : 'text-gray-500 border-transparent hover:text-gray-300'
                          }`}
                        >
                          <Gem className="w-3 h-3 text-cyan-400 animate-pulse" />
                          {t('custom_emojis_tab', 'Кастомные')}
                        </button>
                      </div>

                      {/* Tab Content */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                        {activeEmojiTab === 'standard' ? (
                          <div className="grid grid-cols-6 gap-2 text-2xl p-1">
                            {['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🚀', '👀', '🤔', 
                              '👏', '🌟', '💩', '🙌', '🎨', '💯', '✨', '🥳', '😎', '😭', 
                              '🙏', '💡', '🌟', '💀'].map((emoji, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleAddEmoji(emoji)}
                                className="hover:scale-125 active:scale-95 transition-all text-center p-1 rounded-lg hover:bg-white/5"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : (
                          // Custom Emojis Tab
                          isPro ? (
                            loadingCustomEmojis ? (
                              <div className="h-32 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-purple-500"></div>
                              </div>
                            ) : customEmojis.length > 0 ? (
                              <div className="grid grid-cols-5 gap-2.5 p-1">
                                {customEmojis.map((emoji) => (
                                  <button
                                    key={emoji.id}
                                    type="button"
                                    onClick={() => handleAddCustomEmoji(emoji)}
                                    className="hover:scale-110 active:scale-95 transition-all p-1 rounded-lg hover:bg-white/5 flex flex-col items-center justify-center group"
                                    title={`:${emoji.name}:`}
                                  >
                                    <img
                                      src={emoji.image_url}
                                      alt={emoji.name}
                                      className="w-8 h-8 object-contain rounded"
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="h-32 flex flex-col items-center justify-center text-center p-4">
                                <Smile className="w-6 h-6 text-gray-600 mb-1" />
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('no_custom_emojis', 'Коллекция пуста')}</p>
                                <p className="text-[9px] text-gray-600 mt-1">{t('add_them_in_pro', 'Загрузите их во вкладке Creativity Pro')}</p>
                              </div>
                            )
                          ) : (
                            // Non-Pro Upgrade Placeholder
                            <div className="h-36 flex flex-col items-center justify-center text-center p-4 bg-cyan-500/[0.02] border border-cyan-500/10 rounded-xl space-y-3">
                              <Gem className="w-7 h-7 text-cyan-400 animate-bounce" />
                              <div>
                                <p className="text-[11px] font-black text-white uppercase tracking-wider">{t('unlocked_with_pro', 'Доступно с Creativity Pro')}</p>
                                <p className="text-[9px] text-gray-500 leading-normal mt-1">
                                  {t('emoji_unlock_desc')}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  <div className="relative flex-1 group">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      type="button"
                      className={`absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors z-10 ${showEmojiPicker ? 'text-purple-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={t('type_message') || 'Type a message...'}
                      className="w-full h-14 pl-14 pr-16 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:border-purple-500/30 text-white font-medium placeholder:text-gray-600"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="absolute right-2 top-2 w-10 h-10 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shadow-lg z-10"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
            </div>
          )
          return isFullscreen ? createPortal(panel, document.body) : panel
        })()}
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
