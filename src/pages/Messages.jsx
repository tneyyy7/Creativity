import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Send, User, MessageSquare, Search, ArrowLeft, MoreVertical, BadgeCheck, Trash2, Edit3, X as CloseIcon, Check as SaveIcon, Reply, X, Palette, Camera, Shapes, Smile, Gem, Box, PenTool, Users, UserPlus, LogOut, Pencil, Bell, BellOff, Loader2, Pin, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, sendMessage, fetchMessages, fetchConversations, markAsRead, updateChatPresence, searchFriends, deleteMessage, updateMessage, fetchPaintings, fetchPublicProfile, fetchCustomEmojis, fetchProProfileSettings, fetchChatTheme, saveChatTheme, fetchChatMute, toggleChatMute, fetchChatMutes, fetchChatPins, toggleChatPin, fetchHiddenChats, hideConversation, updateMessageReactions, fetchGroupChats, fetchGroupMessages, sendGroupMessage, fetchGroupMembers, markGroupRead, removeGroupMember, leaveGroup, updateGroupChat, uploadAvatar } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { CreateGroupModal } from '../components/CreateGroupModal'
import { PostViewerModal } from '../components/PostViewerModal'
import { AnimatedPillGroup } from '../components/AnimatedPillGroup'
import { getNicknameStyle } from '../lib/nicknameStyle'

// Small avatar used for group chats (image if set, otherwise a Users glyph).
function GroupAvatar({ avatarUrl, size = 'sm' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  return (
    <div className={`${dim} rounded-2xl overflow-hidden flex items-center justify-center bg-purple-600/15 border border-purple-500/20 flex-shrink-0`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <Users className="w-1/2 h-1/2 text-purple-300" />
      )}
    </div>
  )
}

export function Messages({ currentUser, isPro, initialChatUser, onInitialChatOpened, onViewProfile }) {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMobileView, setIsMobileView] = useState(false)
  const [selectedContextMsg, setSelectedContextMsg] = useState(null)
  // Screen rect of the tapped bubble (so the context menu can be anchored to it
  // instead of being centered) and the resolved on-screen positions.
  const [contextMenuRect, setContextMenuRect] = useState(null)
  const [contextMenuPos, setContextMenuPos] = useState(null)
  const [ctxReady, setCtxReady] = useState(false)
  const contextMenuRef = useRef(null)
  // Tracks whether we are on a phone-sized viewport (Tailwind's md breakpoint = 768px).
  // On phones the open chat is rendered as a full-screen overlay for a real messenger feel.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const isMobileOrTablet = isMobile || (typeof window !== 'undefined' && window.innerWidth <= 1024)
  const longPressTimerRef = useRef(null)
  const pointerStartPos = useRef({ x: 0, y: 0 })
  const wasLongPressRef = useRef(false)

  // --- Chat (conversation) long-press / right-click context menu ---
  // Lets the user pin, mute or hide a whole chat. On phones/PWA it opens on a
  // long press; on desktop via right-click or the hover pin button.
  const [chatMenu, setChatMenu] = useState(null)        // the conversation the menu acts on
  const [chatMenuRect, setChatMenuRect] = useState(null) // screen rect of the tapped row
  const [chatMenuPos, setChatMenuPos] = useState(null)   // resolved on-screen position
  const [chatMenuReady, setChatMenuReady] = useState(false)
  const chatMenuRef = useRef(null)
  const chatLongPressTimer = useRef(null)
  const chatPointerStart = useRef({ x: 0, y: 0 })
  const chatWasLongPress = useRef(false)

  const openChatMenu = (conv, el) => {
    let rect = null
    if (el && typeof el.getBoundingClientRect === 'function') {
      const b = el.getBoundingClientRect()
      rect = { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }
    }
    setChatMenuRect(rect)
    setChatMenuPos(null)
    setChatMenuReady(false)
    setChatMenu(conv)
  }

  const closeChatMenu = () => {
    setChatMenu(null)
    setChatMenuRect(null)
    setChatMenuPos(null)
    setChatMenuReady(false)
  }

  // Open the message action menu, remembering exactly where the tapped bubble
  // sits on screen so the panel can appear right under/over it (iOS/Telegram style).
  const openContextMenu = (msg, el) => {
    let rect = null
    if (el && typeof el.getBoundingClientRect === 'function') {
      const b = el.getBoundingClientRect()
      // The bubble carries `active:scale-[0.99]`, so while it's still pressed
      // getBoundingClientRect() reports the *scaled* (≈1% narrower) box. Pinning
      // that onto the cloned preview shrinks it just enough to wrap the last word
      // onto a second line. Use offsetWidth, which is the untransformed layout
      // width, so the clone keeps the original's line breaks. offsetWidth is
      // rounded to a whole pixel, which can land ~0.5px short of the real
      // content width and force a wrap, so add 1px of slack to stay safe.
      const layoutWidth = (el.offsetWidth || b.width) + 1
      rect = { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: layoutWidth, height: b.height }
    }
    setContextMenuRect(rect)
    setContextMenuPos(null)
    setCtxReady(false)
    setSelectedContextMsg(msg)
  }

  const closeContextMenu = () => {
    setSelectedContextMsg(null)
    setContextMenuRect(null)
    setContextMenuPos(null)
    setCtxReady(false)
  }


  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Resolve where the message action panel should sit: keep the tapped bubble in
  // place and drop the panel directly below it, or flip above it when there is
  // not enough room below. Falls back to a near-bottom position only when the
  // panel cannot fit on either side of the bubble.
  useLayoutEffect(() => {
    if (!selectedContextMsg) return
    let rafId
    const compute = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const MARGIN = 12
      const GAP = 8
      const menuW = Math.min(340, vw - MARGIN * 2)
      const menuH = contextMenuRef.current ? contextMenuRef.current.offsetHeight : 0
      const isMine = selectedContextMsg.sender_id === currentUser.id

      const rect = contextMenuRect || {
        top: vh * 0.4, bottom: vh * 0.4, left: (vw - menuW) / 2,
        right: (vw + menuW) / 2, width: menuW, height: 0,
      }

      // Align the panel to the same side as the bubble, clamped to the viewport.
      let menuLeft = isMine ? rect.right - menuW : rect.left
      menuLeft = Math.max(MARGIN, Math.min(menuLeft, vw - MARGIN - menuW))

      let bubbleTop = rect.top
      let menuTop
      const fitsBelow = rect.bottom + GAP + menuH <= vh - MARGIN
      const fitsAbove = rect.top - GAP - menuH >= MARGIN
      if (fitsBelow) {
        menuTop = rect.bottom + GAP
      } else if (fitsAbove) {
        menuTop = rect.top - GAP - menuH
      } else {
        // Pin the panel to the bottom margin and lift the bubble just above it.
        menuTop = Math.max(MARGIN, vh - MARGIN - menuH)
        bubbleTop = Math.max(MARGIN, menuTop - GAP - rect.height)
      }

      setContextMenuPos({
        bubbleTop, bubbleLeft: rect.left, bubbleWidth: rect.width,
        menuTop, menuLeft, menuWidth: menuW,
        maxMenuHeight: vh - MARGIN * 2,
        placedAbove: !fitsBelow && fitsAbove,
      })
      rafId = requestAnimationFrame(() => setCtxReady(true))
    }
    compute()
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [selectedContextMsg, contextMenuRect, currentUser.id])

  // Position the chat context menu: drop it under the tapped row, flipping above
  // when there isn't room, and clamp it inside the viewport.
  useLayoutEffect(() => {
    if (!chatMenu) return
    let rafId
    const compute = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const MARGIN = 12
      const GAP = 8
      const menuW = Math.min(300, vw - MARGIN * 2)
      const menuH = chatMenuRef.current ? chatMenuRef.current.offsetHeight : 0

      const rect = chatMenuRect || {
        top: vh * 0.4, bottom: vh * 0.4, left: (vw - menuW) / 2,
        right: (vw + menuW) / 2, width: menuW, height: 0,
      }

      let menuLeft = rect.left
      menuLeft = Math.max(MARGIN, Math.min(menuLeft, vw - MARGIN - menuW))

      let menuTop
      const fitsBelow = rect.bottom + GAP + menuH <= vh - MARGIN
      const fitsAbove = rect.top - GAP - menuH >= MARGIN
      if (fitsBelow) menuTop = rect.bottom + GAP
      else if (fitsAbove) menuTop = rect.top - GAP - menuH
      else menuTop = Math.max(MARGIN, vh - MARGIN - menuH)

      setChatMenuPos({
        menuTop, menuLeft, menuWidth: menuW,
        maxMenuHeight: vh - MARGIN * 2,
        placedAbove: !fitsBelow && fitsAbove,
      })
      rafId = requestAnimationFrame(() => setChatMenuReady(true))
    }
    compute()
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [chatMenu, chatMenuRect])



  // Keyboard handling for the full-screen chat. The panel itself ALWAYS covers the
  // entire screen (fixed inset-0) — it is never resized to the visual viewport, which
  // on PWAs can get stuck reporting a stale, too-small height and leave a dark "phantom"
  // strip below the input. Instead we only measure how much the on-screen keyboard
  // overlaps the layout viewport and lift the content up by that amount with padding.
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const isInputFocused = () => {
      const activeEl = document.activeElement
      if (!activeEl) return false
      return activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable')
    }

    const onResize = () => {
      if (!isInputFocused()) {
        setKeyboardInset(0)
        return
      }
      // Height of the layout viewport hidden behind the on-screen keyboard.
      const rawInset = window.innerHeight - vv.height - vv.offsetTop
      const inset = rawInset > 30 ? rawInset : 0
      setKeyboardInset((prev) => (Math.abs(prev - inset) < 1 ? prev : inset))
    }

    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)

    const handleFocusChange = () => {
      setTimeout(onResize, 50)
    }
    window.addEventListener('focusin', handleFocusChange)
    window.addEventListener('focusout', handleFocusChange)

    onResize()
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
      window.removeEventListener('focusin', handleFocusChange)
      window.removeEventListener('focusout', handleFocusChange)
    }
  }, [])

  // Lock the document body while the full-screen chat overlay is open, so scrolling the
  // message list never "leaks" to the page underneath (which would reveal the app header).
  useEffect(() => {
    if (!(isMobile && activeChat)) return
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevOverscroll = body.style.overscrollBehavior
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    return () => {
      body.style.overflow = prevOverflow
      body.style.overscrollBehavior = prevOverscroll
    }
  }, [isMobile, activeChat])

  const isOnline = (lastSeen) => {
    if (!lastSeen) return false
    return (Date.now() - new Date(lastSeen).getTime()) < 2 * 60 * 1000
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [postViewer, setPostViewer] = useState(null) // { paintings, index, authorProfile }
  const scrollRef = useRef(null)
  const messageInputRef = useRef(null)
  // Whether the user is currently parked at (or near) the bottom of the message list.
  // Only then do we auto-stick to the bottom on new messages / viewport changes — otherwise
  // scrolling up to read older messages would yank the view back down ("the kick").
  const shouldAutoScrollRef = useRef(true)
  // Which chat the current `messages` array belongs to (guards stale fetch + scroll timing).
  const messagesChatIdRef = useRef(null)
  const [showReactionPickerId, setShowReactionPickerId] = useState(null)

  // Group chat state. `isGroup` switches every chat code path between the
  // direct-message model (sender/receiver) and the group model (group_id).
  const isGroup = !!activeChat?.is_group
  const [groupMembers, setGroupMembers] = useState([])
  const groupMemberMap = useRef(new Map()) // id -> profile, for sender labels & reply previews
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showMembersPanel, setShowMembersPanel] = useState(false)
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false)
  const groupAvatarInputRef = useRef(null)
  // Group "typing": map of userId -> nickname for everyone currently typing.
  const [groupTypers, setGroupTypers] = useState({})
  const groupTyperTimeouts = useRef({})

  const handleMessagesScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom < 120
  }

  // Typing indicator (ephemeral, via Supabase Realtime broadcast — no DB writes)
  const [isPartnerTyping, setIsPartnerTyping] = useState(false)
  const typingChannelRef = useRef(null)        // shared channel used to broadcast typing events
  const typingStopTimeoutRef = useRef(null)    // debounce: auto-send "stopped typing" after a pause
  const partnerTypingTimeoutRef = useRef(null) // safety: auto-hide partner indicator if "stop" is lost

  // Emoji States and Functions
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [customEmojis, setCustomEmojis] = useState([])
  const [loadingCustomEmojis, setLoadingCustomEmojis] = useState(false)
  const [activeEmojiTab, setActiveEmojiTab] = useState('standard') // 'standard' | 'custom'
  const emojiPickerRef = useRef(null)

  // Pro Chat Theme States and Styles
  const [chatTheme, setChatTheme] = useState('default')
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
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

  // Load mute state for active chat
  useEffect(() => {
    if (currentUser?.id && activeChat?.id) {
      fetchChatMute(currentUser.id, activeChat.id)
        .then(setIsMuted)
        .catch(err => console.error("Error loading chat mute:", err))
    } else {
      setIsMuted(false)
    }
  }, [currentUser?.id, activeChat?.id])

  const handleToggleMute = async () => {
    if (!currentUser?.id || !activeChat?.id) return
    const next = !isMuted
    setIsMuted(next) // optimistic
    try {
      await toggleChatMute(currentUser.id, activeChat.id, next, isGroup)
    } catch (err) {
      console.error('Error toggling chat mute:', err)
      setIsMuted(!next) // revert on failure
    }
  }

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

  // Telegram-style large emoji. A message that is a single emoji and nothing
  // else is rendered oversized; two or more emoji (or any text) stay default.
  const stripEmoji = (s) =>
    s.replace(/(\p{Extended_Pictographic}|\p{Emoji_Component}|[\u{1F1E6}-\u{1F1FF}]|\uFE0F|\u200D|\u20E3)/gu, '')

  // Number of emoji grapheme clusters when the trimmed content is made up
  // entirely of emoji (no letters/numbers/other text); 0 otherwise.
  const soleEmojiCount = (content) => {
    if (!content) return 0
    const trimmed = content.trim()
    if (!trimmed || stripEmoji(trimmed).trim() !== '') return 0
    if (!/\p{Extended_Pictographic}/u.test(trimmed)) return 0
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      return [...seg.segment(trimmed)].filter((s) => s.segment.trim()).length
    } catch {
      return [...trimmed].length
    }
  }

  // Matches a message whose only content is one custom [EMOJI:url:name] tag.
  const singleCustomEmoji = (content) => {
    const m = content?.trim().match(/^\[EMOJI:(https?:\/\/[^:]+):([^\]]+)\]$/)
    return m ? { url: m[1], name: m[2] } : null
  }

  // Story replies are stored as a [STORY_SHARE:{json}] tag whose only editable part is the
  // user's `comment`. Return just that text so editing doesn't expose the raw JSON tag.
  const getEditableText = (content) => {
    if (content?.startsWith('[STORY_SHARE:')) {
      try {
        const data = JSON.parse(content.slice('[STORY_SHARE:'.length, -1))
        return data.comment || ''
      } catch {
        return content
      }
    }
    return content
  }

  // Load conversations. Pinned chats float to the top; "deleted" (hidden) chats
  // are filtered out until a message newer than the hide arrives. Each row is
  // annotated with `is_pinned` / `is_muted` so the context menu reflects state.
  const loadConversations = async () => {
    const [dms, groups, pins, mutes, hides] = await Promise.all([
      fetchConversations(currentUser.id),
      fetchGroupChats(currentUser.id),
      fetchChatPins(currentUser.id),
      fetchChatMutes(currentUser.id),
      fetchHiddenChats(currentUser.id),
    ])
    const pinSet = new Set(pins)
    const muteSet = new Set(mutes)
    const merged = [...dms, ...groups]
      .filter((c) => {
        const hiddenAt = hides.get(c.id)
        return !hiddenAt || (c.last_message_at && c.last_message_at > hiddenAt)
      })
      .map((c) => ({ ...c, is_pinned: pinSet.has(c.id), is_muted: muteSet.has(c.id) }))
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return (b.last_message_at || '').localeCompare(a.last_message_at || '')
      })
    setConversations(merged)
    setLoading(false)
  }

  useEffect(() => {
    loadConversations()
  }, [currentUser.id])

  useEffect(() => {
    if (!initialChatUser?.id || initialChatUser.id === currentUser.id) return

    setActiveChat(initialChatUser)
    setIsMobileView(true)
    setIsSearching(false)
    setSearchQuery('')
    onInitialChatOpened?.()
  }, [initialChatUser, currentUser.id, onInitialChatOpened])

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

  // Load messages when active chat changes — always fetch fresh from the server.
  useEffect(() => {
    if (!activeChat?.id) {
      setMessages([])
      messagesChatIdRef.current = null
      return
    }

    const chatId = activeChat.id
    const chatIsGroup = !!activeChat.is_group

    // Drop the previous chat immediately so stale bubbles never flash on screen.
    setMessages([])
    messagesChatIdRef.current = null
    shouldAutoScrollRef.current = true

    let cancelled = false

    const loadMessages = async () => {
      try {
        const data = chatIsGroup
          ? await fetchGroupMessages(chatId)
          : await fetchMessages(currentUser.id, chatId)
        if (cancelled) return
        messagesChatIdRef.current = chatId
        setMessages(data || [])
        if (chatIsGroup) markGroupRead(chatId, currentUser.id)
        else markAsRead(currentUser.id, chatId)
      } catch (err) {
        if (!cancelled) console.error('Error loading messages:', err)
      }
    }
    loadMessages()

    // Presence + heartbeat only applies to 1-on-1 chats.
    let heartbeatInterval = null
    if (!chatIsGroup) {
      updateChatPresence(currentUser.id, chatId)
      heartbeatInterval = setInterval(() => {
        updateChatPresence(currentUser.id, chatId)
      }, 20000)
    }

    // Simplified Realtime subscription - filter in callback for reliability
    const channel = supabase
      .channel(`chat_${currentUser.id}_${chatId}`)
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
            const isRelevant = chatIsGroup
              ? newMsg.group_id === chatId
              : (newMsg.sender_id === currentUser.id && newMsg.receiver_id === chatId) ||
                (newMsg.sender_id === chatId && newMsg.receiver_id === currentUser.id)

            if (isRelevant) {
              setMessages((prev) => {
                if (prev.find(m => m.id === newMsg.id)) return prev
                return [...prev, newMsg]
              })
              if (chatIsGroup) {
                if (newMsg.sender_id !== currentUser.id) markGroupRead(chatId, currentUser.id)
              } else if (newMsg.receiver_id === currentUser.id) {
                markAsRead(currentUser.id, chatId)
              }
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
      cancelled = true
      if (heartbeatInterval) clearInterval(heartbeatInterval)
      if (!chatIsGroup) updateChatPresence(currentUser.id, null)
      supabase.removeChannel(channel)
    }
  }, [activeChat?.id, activeChat?.is_group, currentUser.id])

  // Load group members (for sender labels, reply previews and the members panel)
  // and keep them fresh when membership changes in realtime.
  useEffect(() => {
    if (!isGroup || !activeChat?.id) {
      setGroupMembers([])
      groupMemberMap.current = new Map()
      return
    }
    let cancelled = false
    const load = async () => {
      const members = await fetchGroupMembers(activeChat.id)
      if (cancelled) return
      setGroupMembers(members)
      groupMemberMap.current = new Map(members.map((m) => [m.id, m]))
    }
    load()

    const channel = supabase
      .channel(`group_members_${activeChat.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${activeChat.id}` }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [isGroup, activeChat?.id])

  // Typing indicator channel. Both participants must join the SAME channel name,
  // so we build a deterministic name from the sorted pair of user ids.
  useEffect(() => {
    if (!activeChat?.id || !currentUser?.id) return
    setIsPartnerTyping(false)
    setGroupTypers({})

    // Groups share one topic per group; DMs use a deterministic name from the
    // sorted pair of user ids so both participants join the same channel.
    const topicName = isGroup
      ? `typing_group_${activeChat.id}`
      : `typing_${[currentUser.id, activeChat.id].sort().join('_')}`
    const channel = supabase.channel(topicName, {
      config: { broadcast: { self: false } }
    })

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.userId === currentUser.id) return
        if (isGroup) {
          if (payload.userId === currentUser.id) return
          setGroupTypers((prev) => {
            const next = { ...prev }
            if (payload.typing) next[payload.userId] = payload.nickname || ''
            else delete next[payload.userId]
            return next
          })
          clearTimeout(groupTyperTimeouts.current[payload.userId])
          if (payload.typing) {
            groupTyperTimeouts.current[payload.userId] = setTimeout(() => {
              setGroupTypers((prev) => {
                const next = { ...prev }
                delete next[payload.userId]
                return next
              })
            }, 4000)
          }
        } else {
          // Only react to the partner's events (ignore anything not from the open chat).
          if (payload.userId !== activeChat.id) return
          setIsPartnerTyping(!!payload.typing)
          clearTimeout(partnerTypingTimeoutRef.current)
          if (payload.typing) {
            // Hide automatically if the "stopped" event never arrives (tab closed, lost packet).
            partnerTypingTimeoutRef.current = setTimeout(() => setIsPartnerTyping(false), 4000)
          }
        }
      })
      .subscribe()

    typingChannelRef.current = channel

    return () => {
      clearTimeout(partnerTypingTimeoutRef.current)
      clearTimeout(typingStopTimeoutRef.current)
      Object.values(groupTyperTimeouts.current).forEach(clearTimeout)
      groupTyperTimeouts.current = {}
      supabase.removeChannel(channel)
      typingChannelRef.current = null
      setIsPartnerTyping(false)
      setGroupTypers({})
    }
  }, [activeChat?.id, currentUser?.id, isGroup])

  const broadcastTyping = (typing) => {
    const channel = typingChannelRef.current
    if (!channel) return
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, typing, nickname: currentUser.nickname }
    })
  }

  // Called on every keystroke: announce "typing", then schedule a "stopped" after a short pause.
  const handleInputChange = (e) => {
    setInput(e.target.value)
    broadcastTyping(true)
    clearTimeout(typingStopTimeoutRef.current)
    typingStopTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000)
  }

  const scrollMessagesToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  // Stick to the bottom on new messages / typing / keyboard resize — but only if the user
  // is already near the bottom, so reading older messages isn't interrupted.
  useEffect(() => {
    if (shouldAutoScrollRef.current) scrollMessagesToBottom()
  }, [messages, keyboardInset, isPartnerTyping, groupTypers])

  // After a chat opens and its messages finish loading, jump to the newest ones
  // before paint so the user never lands in the middle of history.
  useLayoutEffect(() => {
    if (!activeChat?.id || messagesChatIdRef.current !== activeChat.id) return
    shouldAutoScrollRef.current = true
    scrollMessagesToBottom()
    // Images / embeds can change scrollHeight after first layout — one more pass next frame.
    const rafId = requestAnimationFrame(scrollMessagesToBottom)
    return () => cancelAnimationFrame(rafId)
  }, [messages, activeChat?.id])

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return
    const content = expandEmojiShortcodes(input.trim())
    setInput('')

    // Stop the typing indicator the moment a message is sent.
    clearTimeout(typingStopTimeoutRef.current)
    broadcastTyping(false)

    if (editingId) {
      const id = editingId
      setEditingId(null)

      // For story replies, only the comment is editable: keep the original story attachment
      // and swap in the new comment text, re-wrapping it as a [STORY_SHARE:{json}] tag.
      let finalContent = content
      const original = messages.find(m => m.id === id)
      if (original?.content?.startsWith('[STORY_SHARE:')) {
        try {
          const data = JSON.parse(original.content.slice('[STORY_SHARE:'.length, -1))
          data.comment = content
          finalContent = `[STORY_SHARE:${JSON.stringify(data)}]`
        } catch {
          finalContent = content
        }
      }

      try {
        // Optimistic update
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content: finalContent, updated_at: new Date().toISOString() } : m))
        await updateMessage(id, finalContent)
      } catch (err) {
        console.error("Error updating message:", err)
        // Reload messages to restore state
        const data = isGroup
          ? await fetchGroupMessages(activeChat.id)
          : await fetchMessages(currentUser.id, activeChat.id)
        setMessages(data)
      }
      return
    }

    // Optimistic update
    const tempId = Date.now().toString()
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: isGroup ? null : activeChat.id,
      group_id: isGroup ? activeChat.id : null,
      content,
      created_at: new Date().toISOString(),
      is_read: false,
      reply_to_id: replyingTo?.id
    }
    setMessages(prev => [...prev, optimisticMsg])

    const replyToId = replyingTo?.id
    setReplyingTo(null)

    try {
      const sentMsg = isGroup
        ? await sendGroupMessage(currentUser.id, activeChat.id, content, replyToId)
        : await sendMessage(currentUser.id, activeChat.id, content, replyToId)
      // Replace optimistic message with actual one to get proper ID/Date
      setMessages(prev => prev.map(m => m.id === tempId ? sentMsg : m))
    } catch (err) {
      console.error("Error sending message:", err)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }
  }

  const handleToggleReaction = async (msg, emoji) => {
    const currentReactions = msg.reactions && typeof msg.reactions === 'object' ? { ...msg.reactions } : {}
    
    let userReactions = currentReactions[currentUser.id]
    if (!Array.isArray(userReactions)) {
      userReactions = userReactions ? [userReactions] : []
    }
    
    if (userReactions.includes(emoji)) {
      userReactions = userReactions.filter(e => e !== emoji)
    } else {
      if (userReactions.length < 5) {
        userReactions.push(emoji)
      }
    }
    
    if (userReactions.length === 0) {
      delete currentReactions[currentUser.id]
    } else {
      currentReactions[currentUser.id] = userReactions
    }
    
    try {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: currentReactions } : m))
      await updateMessageReactions(msg.id, currentReactions)
    } catch (e) {
      console.error('Error toggling reaction:', e)
    }
  }

  // --- Group management ---
  const isGroupAdmin = isGroup && groupMembers.some((m) => m.id === currentUser.id && m.role === 'admin')

  // Called by CreateGroupModal after a group is created: open it immediately.
  const handleGroupCreated = (group) => {
    if (!group?.id) return
    loadConversations()
    setActiveChat(group)
    setIsMobileView(true)
    setIsSearching(false)
  }

  const handleMembersAdded = () => {
    if (activeChat?.id) fetchGroupMembers(activeChat.id).then((m) => {
      setGroupMembers(m)
      groupMemberMap.current = new Map(m.map((x) => [x.id, x]))
    })
  }

  const handleLeaveGroup = async () => {
    if (!activeChat?.id) return
    if (!window.confirm(t('confirm_leave_group') || 'Leave this group?')) return
    try {
      await leaveGroup(activeChat.id, currentUser.id)
      setShowThemeMenu(false)
      setShowMembersPanel(false)
      setActiveChat(null)
      setIsMobileView(false)
      loadConversations()
    } catch (e) {
      console.error('Leave group error:', e)
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!activeChat?.id || userId === currentUser.id) return
    try {
      await removeGroupMember(activeChat.id, userId)
      const members = await fetchGroupMembers(activeChat.id)
      setGroupMembers(members)
      groupMemberMap.current = new Map(members.map((m) => [m.id, m]))
    } catch (e) {
      console.error('Remove member error:', e)
    }
  }

  const handleRenameGroup = async () => {
    if (!activeChat?.id) return
    const next = window.prompt(t('rename_group') || 'Group name', activeChat.name || '')
    if (next === null) return
    const name = next.trim()
    if (!name || name === activeChat.name) return
    try {
      await updateGroupChat(activeChat.id, { name })
      setActiveChat((prev) => ({ ...prev, name }))
      setShowThemeMenu(false)
      loadConversations()
    } catch (e) {
      console.error('Rename group error:', e)
    }
  }

  // Admins can swap the group photo. Reuses the avatars bucket + group_chats.avatar_url.
  const handleGroupAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = '' // allow re-picking the same file later
    if (!file || !activeChat?.id || !isGroupAdmin) return
    try {
      setUploadingGroupAvatar(true)
      const url = await uploadAvatar(file, currentUser.id)
      await updateGroupChat(activeChat.id, { avatar_url: url })
      setActiveChat((prev) => ({ ...prev, avatar_url: url }))
      loadConversations()
    } catch (err) {
      console.error('Group avatar upload error:', err)
    } finally {
      setUploadingGroupAvatar(false)
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
      const data = isGroup
        ? await fetchGroupMessages(activeChat.id)
        : await fetchMessages(currentUser.id, activeChat.id)
      setMessages(data)
    }
  }

  const replyToMessage = (msg) => {
    setReplyingTo(msg)
    setTimeout(() => {
      messageInputRef.current?.focus()
    }, 50)
  }

  const handleStartEdit = (msg) => {
    setEditingId(msg.id)
    setInput(getEditableText(msg.content))
    setReplyingTo(null)
    setTimeout(() => {
      messageInputRef.current?.focus()
    }, 50)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setInput('')
  }

  const handlePointerDown = (e, msg) => {
    if (!isMobileOrTablet) return
    // Only handle primary (left click / touch) pointer actions
    if (e.button !== 0) return

    // Ignore if pointer is on an interactive child element
    if (e.target.closest('button') || e.target.closest('a') || e.target.closest('[role="button"]') || e.target.closest('img') || e.target.closest('video')) {
      return
    }

    pointerStartPos.current = { x: e.clientX, y: e.clientY }
    wasLongPressRef.current = false
    // Remember the bubble element now; e.currentTarget is reset by the time the timer fires.
    const bubbleEl = e.currentTarget

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)

    longPressTimerRef.current = setTimeout(() => {
      wasLongPressRef.current = true
      openContextMenu(msg, bubbleEl)
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        try {
          window.navigator.vibrate(50)
        } catch (err) {
          // Ignore vibration errors if restricted by browser security sandbox
        }
      }
    }, 500)
  }

  const handlePointerMove = (e) => {
    if (!isMobileOrTablet) return
    if (!longPressTimerRef.current) return

    const diffX = Math.abs(e.clientX - pointerStartPos.current.x)
    const diffY = Math.abs(e.clientY - pointerStartPos.current.y)
    // Cancel long press if pointer moved more than 10px (e.g. during a scroll gesture)
    if (diffX > 10 || diffY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
    }
  }

  const handlePointerUp = (e) => {
    if (!isMobileOrTablet) return
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    if (wasLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      try {
        e.target.releasePointerCapture(e.pointerId)
      } catch (err) {}
    }
  }

  const handlePointerCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    wasLongPressRef.current = false
  }

  // --- Long-press handlers for conversation rows (phones / PWA) ---
  const handleChatPointerDown = (e, conv) => {
    if (!isMobileOrTablet) return
    if (e.button !== 0) return
    chatPointerStart.current = { x: e.clientX, y: e.clientY }
    chatWasLongPress.current = false
    const rowEl = e.currentTarget
    if (chatLongPressTimer.current) clearTimeout(chatLongPressTimer.current)
    chatLongPressTimer.current = setTimeout(() => {
      chatWasLongPress.current = true
      openChatMenu(conv, rowEl)
      try { window.navigator?.vibrate?.(50) } catch (err) {}
    }, 500)
  }

  const handleChatPointerMove = (e) => {
    if (!chatLongPressTimer.current) return
    const dx = Math.abs(e.clientX - chatPointerStart.current.x)
    const dy = Math.abs(e.clientY - chatPointerStart.current.y)
    if (dx > 10 || dy > 10) {
      clearTimeout(chatLongPressTimer.current)
      chatLongPressTimer.current = null
    }
  }

  const handleChatPointerUp = () => {
    if (chatLongPressTimer.current) {
      clearTimeout(chatLongPressTimer.current)
      chatLongPressTimer.current = null
    }
  }

  // --- Chat menu actions ---
  const applyConvUpdate = (chatId, patch) => {
    setConversations((prev) => {
      const next = prev
        .map((c) => (c.id === chatId ? { ...c, ...patch } : c))
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
          return (b.last_message_at || '').localeCompare(a.last_message_at || '')
        })
      return next
    })
  }

  const handleTogglePin = async (conv) => {
    const next = !conv.is_pinned
    applyConvUpdate(conv.id, { is_pinned: next })
    closeChatMenu()
    try {
      await toggleChatPin(currentUser.id, conv.id, next, !!conv.is_group)
    } catch (err) {
      console.error('Error toggling chat pin:', err)
      applyConvUpdate(conv.id, { is_pinned: !next }) // revert
    }
  }

  const handleToggleMuteFromList = async (conv) => {
    const next = !conv.is_muted
    applyConvUpdate(conv.id, { is_muted: next })
    if (conv.id === activeChat?.id) setIsMuted(next)
    closeChatMenu()
    try {
      await toggleChatMute(currentUser.id, conv.id, next, !!conv.is_group)
    } catch (err) {
      console.error('Error toggling chat mute:', err)
      applyConvUpdate(conv.id, { is_muted: !next }) // revert
      if (conv.id === activeChat?.id) setIsMuted(!next)
    }
  }

  const handleHideChat = async (conv) => {
    if (!window.confirm(t('confirm_delete_chat') || 'Удалить этот чат из списка?')) return
    const removed = conv
    setConversations((prev) => prev.filter((c) => c.id !== conv.id))
    if (activeChat?.id === conv.id) { setActiveChat(null); setIsMobileView(false) }
    closeChatMenu()
    try {
      await hideConversation(currentUser.id, conv.id, !!conv.is_group)
    } catch (err) {
      console.error('Error hiding chat:', err)
      // Restore on failure by reloading the list.
      loadConversations()
      void removed
    }
  }

  const isGroupMessageRead = (msg) => {

    if (!isGroup || !groupMembers || groupMembers.length === 0) return false
    return groupMembers.some(member => {
      if (member.id === msg.sender_id) return false
      if (!member.last_read_at) return false
      return new Date(member.last_read_at) >= new Date(msg.created_at)
    })
  }

  // Per-person read-receipt list shown in the message-info card (own messages only).
  // For groups every other member is listed with their read/delivered state; for
  // direct chats it's just the single interlocutor. `readTime` is null when unread.
  const getMessageReaders = (msg) => {
    if (!msg) return []
    if (isGroup) {
      return groupMembers
        .filter((m) => m.id !== currentUser.id)
        .map((m) => {
          const read = !!m.last_read_at && new Date(m.last_read_at) >= new Date(msg.created_at)
          return {
            id: m.id,
            nickname: m.nickname,
            nickname_color: m.nickname_color,
            avatar_url: m.avatar_url,
            avatar_frame: m.avatar_frame,
            finished_work_count: m.finished_work_count,
            isPro: m.isPro,
            is_verified: m.is_verified,
            read,
            readTime: read ? m.last_read_at : null,
          }
        })
        // Readers first, then people who haven't seen it yet.
        .sort((a, b) => (a.read === b.read ? 0 : a.read ? -1 : 1))
    }
    if (activeChat) {
      const read = !!msg.is_read
      return [{
        id: activeChat.id,
        nickname: activeChat.nickname,
        nickname_color: activeChat.nickname_color,
        avatar_url: activeChat.avatar_url,
        avatar_frame: activeChat.avatar_frame,
        finished_work_count: activeChat.finished_work_count,
        isPro: activeChat.isPro,
        is_verified: activeChat.is_verified,
        read,
        readTime: read ? (msg.read_at || null) : null,
      }]
    }
    return []
  }

  const renderMessageContent = (msg) => {
    if (!msg) return null;
    return (
      <>
        {isGroup && msg.sender_id !== currentUser.id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewProfile?.(msg.sender_id); }}
            className="block text-[11px] font-black mb-1 hover:underline"
            style={getNicknameStyle(groupMemberMap.current.get(msg.sender_id)?.nickname_color, '#c4b5fd')}
          >
            {groupMemberMap.current.get(msg.sender_id)?.nickname || t('user') || 'User'}
          </button>
        )}
        {msg.reply_to_id && (() => {
          const repliedMsg = messages.find(m => m.id === msg.reply_to_id)
          const repliedName = repliedMsg?.sender_id === currentUser.id
            ? (t('you') || 'You')
            : isGroup
              ? (groupMemberMap.current.get(repliedMsg?.sender_id)?.nickname || t('user') || 'User')
              : activeChat.nickname
          return (
            <div className="mb-2 p-2 bg-black/20 rounded-lg border-l-2 border-purple-400/50 text-xs opacity-80 max-w-full truncate flex flex-col">
              <span className="text-[10px] uppercase font-bold text-purple-300/70 mb-1">{repliedName}</span>
              <span className="truncate italic">"{cleanEmojiTags(repliedMsg?.content) || t('message_deleted')}"</span>
            </div>
          )
        })()}
        {msg.content?.startsWith('[PROFILE_SHARE:') ? (() => {
          try {
            const data = JSON.parse(msg.content.replace('[PROFILE_SHARE:', '').replace(']', ''))
            return (
              <div className="py-2 space-y-4">
                <div className="flex flex-col items-center text-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
                  <ProfileAvatar avatarUrl={data.avatar_url} workCount={data.work_count} size="lg" isPro={data.isPro} avatarFrame={data.avatar_frame} />
                  <div>
                    <h4 className="font-black text-white text-lg flex items-center justify-center gap-1.5 notranslate" translate="no">
                      <span style={getNicknameStyle(data.nickname_color)}>
                        {data.nickname}
                      </span>
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
                  onClick={(e) => { e.stopPropagation(); onViewProfile?.(data.id); }}
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
                onClick={(e) => { e.stopPropagation(); openSharedPost(data); }}
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
        })() : (() => {
          // Telegram-style: a lone emoji is shown big; several stay small.
          const custom = singleCustomEmoji(msg.content)
          if (custom) {
            return (
              <img
                src={custom.url}
                alt={`:${custom.name}:`}
                title={`:${custom.name}:`}
                className="block w-20 h-20 sm:w-24 sm:h-24 object-contain select-none animate-in fade-in zoom-in-50 duration-200"
              />
            )
          }
          if (soleEmojiCount(msg.content) === 1) {
            return (
              <span className="block text-5xl sm:text-6xl leading-none py-0.5">
                {msg.content.trim()}
              </span>
            )
          }
          return parseMessageContent(msg.content)
        })()}
      </>
    );
  }

  const openSharedPost = async (data) => {
    try {
      let sharedPainting = null
      if (data.painting_id) {
        const { data: painting, error } = await supabase
          .from('paintings')
          .select('*')
          .eq('id', data.painting_id)
          .maybeSingle()
        if (error) throw error
        sharedPainting = painting
      }

      const authorId = data.author_id || sharedPainting?.user_id
      if (!authorId) return

      const [paintings, profile] = await Promise.all([
        fetchPaintings(authorId),
        fetchPublicProfile(authorId)
      ])

      const finished = (paintings || []).filter(p => p && p.is_finished)
      const fallbackPainting = sharedPainting || {
        id: data.painting_id,
        user_id: authorId,
        image_url: data.image_url,
        title: data.title,
        is_finished: true
      }
      const collection = finished.length > 0 ? finished : [fallbackPainting]
      const idx = collection.findIndex(p => p.id === data.painting_id)

      setPostViewer({
        paintings: collection,
        index: idx >= 0 ? idx : 0,
        authorProfile: profile
      })
    } catch (e) {
      console.error('Open post error:', e)
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
      <div className="h-full flex flex-col md:flex-row gap-4 md:gap-6 max-w-none w-full min-h-0">
        {/* Conversations List */}
        <div className={`
        h-full flex-col w-full md:w-80 glass-card p-4 space-y-4 min-h-0
        ${activeChat && isMobileView && !isMobile ? 'hidden' : 'flex'}
        md:flex
      `}>
          <div className="flex items-center justify-between px-2">
            <h1 className="text-2xl font-black text-white">{t('messages') || 'Messages'}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateGroup(true)}
                title={t('create_group') || 'New group'}
                className="p-2 rounded-lg transition-all bg-white/5 text-purple-500 hover:bg-white/10"
              >
                <Users className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsSearching(!isSearching)}
                className={`p-2 rounded-lg transition-all ${isSearching ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'bg-white/5 text-purple-500 hover:bg-white/10'}`}
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
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
                  className="w-full h-11 pl-11 pr-4 bg-white/5 border border-white/5 rounded-xl focus:outline-none focus:border-purple-500/30 transition-all text-base md:text-sm text-white"
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
                      <p className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span style={getNicknameStyle(user.nickname_color, '#fff')}>
                          {user.nickname}
                        </span>
                        {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                        {user.isPro && (
                          <span className="pro-badge">
                            <Gem className="pro-badge-icon" />
                            <span className="pro-badge-text">Pro</span>
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-[10px] text-purple-500 uppercase tracking-widest font-black leading-none whitespace-nowrap flex-shrink-0">{t('new_chat') || 'New Chat'}</p>
                        {user.specialization && (
                          <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest leading-none border-l border-white/10 pl-2 whitespace-nowrap overflow-hidden">
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
                  onClick={() => {
                    if (chatWasLongPress.current) { chatWasLongPress.current = false; return }
                    setActiveChat(conv); setIsMobileView(true);
                  }}
                  onContextMenu={(e) => { e.preventDefault(); openChatMenu(conv, e.currentTarget) }}
                  onPointerDown={(e) => handleChatPointerDown(e, conv)}
                  onPointerMove={handleChatPointerMove}
                  onPointerUp={handleChatPointerUp}
                  onPointerLeave={handleChatPointerUp}
                  onPointerCancel={handleChatPointerUp}
                  className={`
                  group w-full flex items-center gap-3 p-3 rounded-xl transition-all relative select-none
                  ${activeChat?.id === conv.id ? 'bg-purple-600/10 text-white' : 'text-gray-400 hover:bg-white/5'}
                `}
                >
                  {conv.is_group ? (
                    <GroupAvatar avatarUrl={conv.avatar_url} />
                  ) : (
                    <ProfileAvatar avatarUrl={conv.avatar_url} workCount={conv.finished_work_count} size="sm" isOnline={isOnline(conv.last_seen)} isPro={conv.isPro} avatarFrame={conv.avatar_frame} />
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-bold text-sm truncate flex items-center gap-1.5">
                      {conv.is_group ? (
                        <span className="flex items-center gap-1.5 text-white truncate">
                          <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                          {conv.name}
                        </span>
                      ) : (
                        <>
                          <span style={getNicknameStyle(conv.nickname_color, '#fff')}>
                            {conv.nickname}
                          </span>
                          {conv.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                          {conv.isPro && (
                            <span className="pro-badge">
                              <Gem className="pro-badge-icon" />
                              <span className="pro-badge-text">Pro</span>
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={`text-[10px] truncate leading-none ${conv.unread_count > 0 ? 'text-purple-400 font-bold' : 'text-gray-500'}`}>
                        {conv.unread_count > 0 ? t('new_messages') || 'New messages' : conv.is_group ? (t('group_chat') || 'Group chat') : (t('click_to_chat') || 'Click to chat')}
                      </p>
                      {!conv.is_group && conv.specialization && (
                        <span className="flex items-center gap-1 text-purple-400 text-[9px] font-black uppercase tracking-widest leading-none border-l border-white/10 pl-2 whitespace-nowrap overflow-hidden flex-shrink-0">
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
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {conv.is_muted && (
                      <BellOff className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    {conv.is_pinned && (
                      <Pin className="w-3.5 h-3.5 text-purple-400 fill-purple-400/30 -rotate-45" />
                    )}
                    {conv.unread_count > 0 && activeChat?.id !== conv.id && (
                      <div className="w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-red-500/40">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </div>
                    )}
                    {/* Desktop hover affordance: quick pin/unpin without opening the menu. */}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => { e.stopPropagation(); handleTogglePin(conv) }}
                      title={conv.is_pinned ? (t('unpin_chat') || 'Открепить') : (t('pin_chat') || 'Закрепить')}
                      className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-gray-400 hover:text-purple-300 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      {conv.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4 -rotate-45" />}
                    </span>
                  </div>
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
              id={isFullscreen ? 'mobile-chat-panel' : undefined}
              style={isFullscreen ? {
                // The panel always spans the full screen (inset-0). Only the inner
                // content is pushed up above the keyboard via padding — so a stale
                // visual-viewport height can never leave a dark gap at the bottom.
                paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined
              } : undefined}
              className={
                isFullscreen
                  ? 'fixed inset-0 z-[90] flex flex-col bg-[#0c0b11] overscroll-contain'
                  : `flex-1 glass-card flex-col relative overflow-hidden ${activeChat && isMobileView ? 'flex' : 'hidden md:flex'} ${!activeChat ? 'items-center justify-center' : ''}`
              }
            >
          {!activeChat ? (
            <div className="text-center space-y-4 opacity-40">
              <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto">
                <MessageSquare className="w-10 h-10 text-gray-500" />
              </div>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">{t('select_chat_to_start') || 'Select a chat to start'}</p>
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
                  onClick={() => { if (isGroup) setShowMembersPanel(true); else onViewProfile(activeChat.id) }}
                  className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                >
                  {isGroup ? (
                    <GroupAvatar avatarUrl={activeChat.avatar_url} />
                  ) : (
                    <ProfileAvatar avatarUrl={activeChat.avatar_url} workCount={activeChat.finished_work_count} size="sm" isOnline={isOnline(activeChat.last_seen)} isPro={activeChat.isPro} avatarFrame={activeChat.avatar_frame} />
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <h3 className="font-bold text-white flex items-center gap-1.5 truncate">
                      {isGroup ? (
                        <span className="flex items-center gap-1.5 truncate">
                          <Users className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          {activeChat.name}
                        </span>
                      ) : (
                        <>
                          <span style={getNicknameStyle(activeChat.nickname_color)}>
                            {activeChat.nickname}
                          </span>
                          {activeChat.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                          {activeChat.isPro && (
                            <span className="pro-badge">
                              <Gem className="pro-badge-icon" />
                              <span className="pro-badge-text">Pro</span>
                            </span>
                          )}
                        </>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {isGroup ? (
                        Object.keys(groupTypers).length > 0 ? (
                          <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest leading-none flex items-center gap-1.5 animate-in fade-in duration-200 truncate">
                            {Object.entries(groupTypers).map(([id, nick]) => groupMemberMap.current.get(id)?.nickname || nick).filter(Boolean).join(', ')} {t('typing')}
                          </p>
                        ) : (
                          <p className="text-[10px] text-purple-500 font-black uppercase tracking-widest leading-none">
                            {groupMembers.length} {t('members_count') || 'members'}
                          </p>
                        )
                      ) : isPartnerTyping ? (
                        <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest leading-none flex items-center gap-1.5 animate-in fade-in duration-200">
                          {t('typing')}
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"></span>
                            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          </span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-purple-500 font-black uppercase tracking-widest leading-none">Active Chat</p>
                      )}
                      {!isGroup && activeChat.specialization && (
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
                                data-lg-fx
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

                      <div className="mt-2 pt-2 border-t border-white/5">
                        <button
                          onClick={handleToggleMute}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            isMuted
                              ? 'text-amber-400 hover:bg-amber-500/10'
                              : 'text-gray-300 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {isMuted
                            ? <><Bell className="w-3.5 h-3.5" /> {t('unmute_chat') || 'Unmute'}</>
                            : <><BellOff className="w-3.5 h-3.5" /> {t('mute_chat') || 'Mute'}</>}
                        </button>
                      </div>

                      {isGroup && (
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                          <button
                            onClick={() => { setShowMembersPanel(true); setShowThemeMenu(false) }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
                          >
                            <Users className="w-3.5 h-3.5" /> {t('group_members') || 'Members'}
                          </button>
                          {isGroupAdmin && (
                            <>
                              <button
                                onClick={() => { setShowAddMembers(true); setShowThemeMenu(false) }}
                                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> {t('add_members') || 'Add members'}
                              </button>
                              <button
                                onClick={handleRenameGroup}
                                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
                              >
                                <Pencil className="w-3.5 h-3.5" /> {t('rename_group') || 'Rename'}
                              </button>
                              <button
                                onClick={() => { setShowThemeMenu(false); if (!uploadingGroupAvatar) groupAvatarInputRef.current?.click() }}
                                className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
                              >
                                <Camera className="w-3.5 h-3.5" /> {t('change_group_photo') || 'Change photo'}
                              </button>
                            </>
                          )}
                          <button
                            onClick={handleLeaveGroup}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2"
                          >
                            <LogOut className="w-3.5 h-3.5" /> {t('leave_group') || 'Leave group'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Area */}
              <div
                ref={scrollRef}
                onScroll={handleMessagesScroll}
                className={`flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2 sm:space-y-3 custom-scrollbar transition-all duration-500 ${activeTheme.bg}`}
              >
                {messages.map((msg, i) => (
                  <div
                    key={msg.id || i}
                    className={`flex group ${msg.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      onPointerDown={(e) => handlePointerDown(e, msg)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onClick={(e) => {
                        if (isMobileOrTablet) {
                          if (e.target.closest('button') || e.target.closest('a') || e.target.closest('[role="button"]') || e.target.closest('img') || e.target.closest('video')) {
                            return
                          }
                          e.stopPropagation()
                          if (wasLongPressRef.current) {
                            wasLongPressRef.current = false
                            return
                          }
                          openContextMenu(msg, e.currentTarget)
                        }
                      }}
                      className={`
                      max-w-[85%] sm:max-w-[75%] md:max-w-[70%] relative pt-2.5 pb-1.5 px-3.5 sm:pt-3 sm:pb-2 sm:px-4 rounded-2xl md:rounded-[1.5rem] text-sm md:text-[15px] font-medium shadow-xl transition-all
                      ${msg.sender_id === currentUser.id
                          ? `${activeTheme.myBubble} rounded-tr-none ml-auto`
                          : `${activeTheme.theirBubble} rounded-tl-none mr-auto`}
                      ${isMobileOrTablet ? 'cursor-pointer active:scale-[0.99] select-none' : ''}
                    `}>
                      {renderMessageContent(msg)}

                      {/* Message Reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-0.5 justify-start">
                          {Object.entries(
                            Object.entries(msg.reactions).reduce((acc, [uid, emos]) => {
                              const emosArray = Array.isArray(emos) ? emos : (emos ? [emos] : [])
                              emosArray.forEach(emo => {
                                acc[emo] = acc[emo] || []
                                acc[emo].push(uid)
                              })
                              return acc
                            }, {})
                          ).map(([emo, uids]) => {
                            const hasReacted = uids.includes(currentUser.id)
                            return (
                              <button
                                key={emo}
                                onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, emo); }}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs border transition-all ${
                                  msg.sender_id === currentUser.id
                                    ? hasReacted
                                      ? 'bg-black/35 border-white/20 text-white font-bold'
                                      : 'bg-black/15 border-black/10 text-white/80 hover:bg-black/25 hover:text-white'
                                    : hasReacted
                                      ? 'bg-purple-600/20 border-purple-500/30 text-purple-300'
                                      : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                              >
                                <span className="shrink-0 flex items-center [&_img]:w-5 [&_img]:h-5 [&_img]:mx-0">
                                  {emo.startsWith('[EMOJI:') ? parseMessageContent(emo) : emo}
                                </span>
                                <span className="font-bold leading-none">{uids.length}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 gap-4">
                        <div className="flex items-center gap-1 opacity-50">
                          <span className="text-[9px]">
                            {msg.updated_at && msg.updated_at !== msg.created_at ? `(${t('edited')}) ` : ''}
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.sender_id === currentUser.id && (
                            <span className="text-[10px] font-bold tracking-tighter">
                              {isGroup 
                                ? (isGroupMessageRead(msg) ? '✓✓' : '✓')
                                : (msg.is_read ? '✓✓' : '✓')}
                            </span>
                          )}
                        </div>
                        
                        {/* Inline actions (Smile, Reply, Edit, Delete) - Desktop only */}
                        {!isMobileOrTablet && (
                          msg.sender_id === currentUser.id ? (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setShowReactionPickerId(showReactionPickerId === msg.id ? null : msg.id); }} className="p-1 hover:text-purple-300 transition-colors" title={t('add_reaction', 'Добавить реакцию')}>
                                  <Smile className="w-3.5 h-3.5" />
                                </button>
                                {showReactionPickerId === msg.id && (
                                  <div className="absolute bottom-full right-0 mb-1 z-[100] bg-[#121214]/90 border border-white/10 backdrop-blur-md px-1.5 py-1 rounded-2xl flex flex-wrap items-center justify-center gap-1 w-[min(17rem,calc(100vw-2rem))] shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
                                    {['👍', '❤️', '🔥', '😂', '😮', '😢'].map(emoji => (
                                      <button key={emoji} onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, emoji); setShowReactionPickerId(null); }} className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-white/5 active:scale-90 transition-all text-base">
                                        {emoji}
                                      </button>
                                    ))}
                                    {isPro && customEmojis.length > 0 && (
                                      <>
                                        <div className="w-px h-4 bg-white/10 self-center mx-1" />
                                        {customEmojis.slice(0, 10).map(emoji => (
                                          <button key={emoji.id} onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, `[EMOJI:${emoji.image_url}:${emoji.name}]`); setShowReactionPickerId(null); }} className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-white/5 active:scale-90 transition-all">
                                            <img src={emoji.image_url} alt={emoji.name} className="w-[22px] h-[22px] object-contain" />
                                          </button>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); replyToMessage(msg); }} className="p-1 hover:text-purple-300 transition-colors" title={t('reply') || 'Reply'}>
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              {!msg.content?.startsWith('[PROFILE_SHARE:') && !msg.content?.startsWith('[POST_SHARE:') && (
                                <button onClick={(e) => { e.stopPropagation(); handleStartEdit(msg); }} className="p-1 hover:text-purple-300 transition-colors">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }} className="p-1 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setShowReactionPickerId(showReactionPickerId === msg.id ? null : msg.id); }} className="p-1 hover:text-purple-300 transition-colors" title={t('add_reaction', 'Добавить реакцию')}>
                                  <Smile className="w-3.5 h-3.5" />
                                </button>
                                {showReactionPickerId === msg.id && (
                                  <div className="absolute bottom-full left-0 mb-1 z-[100] bg-[#121214]/90 border border-white/10 backdrop-blur-md px-1.5 py-1 rounded-2xl flex flex-wrap items-center justify-center gap-1 w-[min(17rem,calc(100vw-2rem))] shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
                                    {['👍', '❤️', '🔥', '😂', '😮', '😢'].map(emoji => (
                                      <button key={emoji} onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, emoji); setShowReactionPickerId(null); }} className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-white/5 active:scale-90 transition-all text-base">
                                        {emoji}
                                      </button>
                                    ))}
                                    {isPro && customEmojis.length > 0 && (
                                      <>
                                        <div className="w-px h-4 bg-white/10 self-center mx-1" />
                                        {customEmojis.slice(0, 10).map(emoji => (
                                          <button key={emoji.id} onClick={(e) => { e.stopPropagation(); handleToggleReaction(msg, `[EMOJI:${emoji.image_url}:${emoji.name}]`); setShowReactionPickerId(null); }} className="w-[34px] h-[34px] flex items-center justify-center rounded-xl hover:bg-white/5 active:scale-90 transition-all">
                                            <img src={emoji.image_url} alt={emoji.name} className="w-[22px] h-[22px] object-contain" />
                                          </button>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); replyToMessage(msg); }} className="p-1 hover:text-purple-300 transition-colors" title={t('reply') || 'Reply'}>
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {(isGroup ? Object.keys(groupTypers).length > 0 : isPartnerTyping) && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className={`${activeTheme.theirBubble} rounded-2xl md:rounded-[1.5rem] rounded-tl-none px-4 py-3 shadow-xl flex items-center gap-1.5`}>
                      <span className="w-2 h-2 bg-current opacity-60 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-current opacity-60 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-current opacity-60 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    </div>
                  </div>
                )}
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
                {editingId && (
                  <div className="mb-3 p-3 bg-cyan-600/10 rounded-xl border border-cyan-500/20 flex items-center justify-between animate-in slide-in-from-bottom-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <Edit3 className="w-3 h-3 text-cyan-400" />
                        {t('editing_message') || 'Editing Message'}
                      </p>
                      <p className="text-xs text-gray-300 truncate italic">
                        "{cleanEmojiTags(getEditableText(messages.find(m => m.id === editingId)?.content || ''))}"
                      </p>
                    </div>
                    <button
                      onClick={handleCancelEdit}
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
                      <div className="pb-2 border-b border-white/5">
                        <AnimatedPillGroup
                          value={activeEmojiTab}
                          onChange={setActiveEmojiTab}
                          options={[
                            { value: 'standard', label: t('standard_emojis', 'Стандартные') },
                            {
                              value: 'custom',
                              icon: <Gem className="w-3 h-3 text-cyan-400 animate-pulse" />,
                              label: t('custom_emojis_tab', 'Кастомные'),
                            },
                          ]}
                          containerClassName="flex items-center gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/5"
                          buttonClassName="lg-pill flex-1 py-1.5 text-xs font-black uppercase tracking-tighter rounded-xl"
                          inactiveClassName="text-gray-500 hover:text-gray-300"
                          pillClassName="rounded-xl"
                          pillVariant="glass"
                        />
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
                    {/* Иконку-эмодзи держим в full-height flex-обёртке: центрируем
                        её БЕЗ трансформа и жёстко привязываем к границам поля
                        (inset-y-0), поэтому она не может «сползти» со своего места. */}
                    <div className="absolute left-4 inset-y-0 flex items-center z-10 pointer-events-none">
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        type="button"
                        className={`pointer-events-auto p-1.5 rounded-lg transition-colors ${showEmojiPicker ? 'text-purple-400 bg-white/5' : 'text-gray-500 hover:text-white'}`}
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                    </div>
                    <input
                      ref={messageInputRef}
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={editingId ? (t('editing_message') || 'Edit Message...') : (t('type_message') || 'Type a message...')}
                      className={`w-full h-14 pl-14 pr-16 bg-white/5 border rounded-2xl focus:outline-none text-white text-base font-medium placeholder:text-gray-600 transition-all ${
                        editingId 
                          ? 'border-cyan-500/30 focus:border-cyan-500/50' 
                          : 'border-white/5 focus:border-purple-500/30'
                      }`}
                    />
                    {/* Кнопку отправки — так же в full-height flex-обёртке, чтобы
                        она оставалась статичной и не выходила за границы поля. */}
                    <div className="absolute right-2 inset-y-0 flex items-center z-10">
                      <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className={`w-10 h-10 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shadow-lg ${
                          editingId 
                            ? 'bg-cyan-600 hover:bg-cyan-500' 
                            : 'bg-purple-600 hover:bg-purple-500'
                        }`}
                      >
                        {editingId ? <SaveIcon className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                      </button>
                    </div>
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

      {/* Shared hidden picker for swapping the active group's photo (admins only) */}
      <input
        ref={groupAvatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGroupAvatarChange}
      />

      {/* Create group */}
      {showCreateGroup && (
        <CreateGroupModal
          currentUser={currentUser}
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
      )}

      {/* Add members to the active group */}
      {showAddMembers && isGroup && (
        <CreateGroupModal
          currentUser={currentUser}
          mode="add"
          groupId={activeChat.id}
          existingMemberIds={groupMembers.map((m) => m.id)}
          onClose={() => setShowAddMembers(false)}
          onCreated={handleMembersAdded}
        />
      )}

      {/* Members panel */}
      {showMembersPanel && isGroup && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowMembersPanel(false)}
        >
          <div
            className="w-full max-w-md bg-[#15131d] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-3 pt-3">
              <button onClick={() => setShowMembersPanel(false)} className="p-2 text-gray-400 hover:text-white transition-colors">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Group identity — admins tap the avatar to change the group photo */}
            <div className="flex flex-col items-center px-5 pb-3 -mt-1">
              <button
                type="button"
                onClick={() => { if (isGroupAdmin && !uploadingGroupAvatar) groupAvatarInputRef.current?.click() }}
                disabled={!isGroupAdmin || uploadingGroupAvatar}
                title={isGroupAdmin ? (t('change_group_photo') || 'Change photo') : undefined}
                className={`relative w-20 h-20 rounded-3xl overflow-hidden flex items-center justify-center bg-purple-600/15 border border-purple-500/20 flex-shrink-0 transition-transform ${isGroupAdmin ? 'cursor-pointer hover:scale-[1.03] active:scale-95' : 'cursor-default'}`}
              >
                {activeChat.avatar_url ? (
                  <img src={activeChat.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-9 h-9 text-purple-300" />
                )}
                {uploadingGroupAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </span>
                )}
                {isGroupAdmin && !uploadingGroupAvatar && (
                  <span className="absolute bottom-0 right-0 w-7 h-7 flex items-center justify-center bg-purple-600 border-2 border-[#15131d] rounded-full">
                    <Camera className="w-3.5 h-3.5 text-white" />
                  </span>
                )}
              </button>
              <h3 className="mt-3 max-w-full text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="truncate notranslate" translate="no">{activeChat.name}</span>
              </h3>
              <p className="mt-0.5 text-[11px] text-purple-500 font-black uppercase tracking-widest">
                {groupMembers.length} {t('members_count') || 'members'}
              </p>
            </div>
            {isGroupAdmin && (
              <div className="px-5 pb-3">
                <button
                  onClick={() => { setShowMembersPanel(false); setShowAddMembers(true) }}
                  className="w-full h-11 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-200 font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <UserPlus className="w-4 h-4" /> {t('add_members') || 'Add members'}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-5 space-y-1">
              {groupMembers.map((m) => (
                <div key={m.id} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/5 transition-all">
                  <button onClick={() => { setShowMembersPanel(false); onViewProfile?.(m.id) }}>
                    <ProfileAvatar avatarUrl={m.avatar_url} workCount={m.finished_work_count} size="sm" isPro={m.isPro} avatarFrame={m.avatar_frame} />
                  </button>
                  <button
                    onClick={() => { setShowMembersPanel(false); onViewProfile?.(m.id) }}
                    className="flex-1 flex items-center gap-1.5 font-bold text-white notranslate text-left min-w-0"
                    translate="no"
                  >
                    <span className="truncate" style={getNicknameStyle(m.nickname_color, '#fff')}>
                      {m.id === currentUser.id ? (t('you') || 'You') : m.nickname}
                    </span>
                    {m.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                    {m.role === 'admin' && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-purple-400 border border-purple-500/30 rounded-md px-1.5 py-0.5 flex-shrink-0">
                        {t('group_admin') || 'Admin'}
                      </span>
                    )}
                  </button>
                  {isGroupAdmin && m.id !== currentUser.id && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                      title={t('remove_member') || 'Remove'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Telegram-style mobile/tablet context menu overlay.
          The tapped bubble is cloned in place and the action panel is anchored
          directly below it (or above it when there isn't room below). */}
      {selectedContextMsg && createPortal(
        <div 
          className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeContextMenu}
        >
          {/* 1. Cloned Message Bubble Preview (anchored to the original position) */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: contextMenuPos ? contextMenuPos.bubbleTop : 0,
              left: contextMenuPos ? contextMenuPos.bubbleLeft : 0,
              width: contextMenuPos ? contextMenuPos.bubbleWidth : undefined,
              visibility: contextMenuPos ? 'visible' : 'hidden',
              opacity: ctxReady ? 1 : 0,
              transition: 'opacity 0.15s ease-out',
            }}
          >
            <div className={`
              w-full relative pt-2.5 pb-1.5 px-3.5 sm:pt-3 sm:pb-2 sm:px-4 rounded-2xl md:rounded-[1.5rem] text-sm md:text-[15px] font-medium shadow-xl
              ${selectedContextMsg.sender_id === currentUser.id
                ? `${activeTheme.myBubble} rounded-tr-none`
                : `${activeTheme.theirBubble} rounded-tl-none`}
            `}>
              {renderMessageContent(selectedContextMsg)}

              {/* Cloned reactions list */}
              {selectedContextMsg.reactions && Object.keys(selectedContextMsg.reactions).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 mb-0.5 justify-start">
                  {Object.entries(
                    Object.entries(selectedContextMsg.reactions).reduce((acc, [uid, emos]) => {
                      const emosArray = Array.isArray(emos) ? emos : (emos ? [emos] : [])
                      emosArray.forEach(emo => {
                        acc[emo] = acc[emo] || []
                        acc[emo].push(uid)
                      })
                      return acc
                    }, {})
                  ).map(([emo, uids]) => {
                    const hasReacted = uids.includes(currentUser.id)
                    return (
                      <button
                        key={emo}
                        onClick={(e) => { e.stopPropagation(); handleToggleReaction(selectedContextMsg, emo); closeContextMenu(); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs border transition-all ${
                          selectedContextMsg.sender_id === currentUser.id
                            ? hasReacted
                              ? 'bg-black/35 border-white/20 text-white font-bold'
                              : 'bg-black/15 border-black/10 text-white/80 hover:bg-black/25 hover:text-white'
                            : hasReacted
                              ? 'bg-purple-600/20 border-purple-500/30 text-purple-300'
                              : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <span className="shrink-0 flex items-center [&_img]:w-5 [&_img]:h-5 [&_img]:mx-0">
                          {emo.startsWith('[EMOJI:') ? parseMessageContent(emo) : emo}
                        </span>
                        <span className="font-bold leading-none">{uids.length}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              
              <div className="flex items-center justify-between mt-2 gap-4">
                <span className="text-[9px] opacity-50">
                  {selectedContextMsg.updated_at && selectedContextMsg.updated_at !== selectedContextMsg.created_at ? `(${t('edited')}) ` : ''}
                  {new Date(selectedContextMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {selectedContextMsg.sender_id === currentUser.id && (
                  <span className="text-[10px] font-bold tracking-tighter opacity-50">
                    {isGroup 
                      ? (isGroupMessageRead(selectedContextMsg) ? '✓✓' : '✓')
                      : (selectedContextMsg.is_read ? '✓✓' : '✓')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Action panel + info card (anchored below/above the bubble) */}
          <div
            ref={contextMenuRef}
            onClick={(e) => e.stopPropagation()}
            className="space-y-2 overflow-y-auto scrollbar-none"
            style={{
              position: 'fixed',
              top: contextMenuPos ? contextMenuPos.menuTop : 0,
              left: contextMenuPos ? contextMenuPos.menuLeft : 0,
              width: contextMenuPos ? contextMenuPos.menuWidth : Math.min(340, (typeof window !== 'undefined' ? window.innerWidth : 360) - 24),
              maxHeight: contextMenuPos ? contextMenuPos.maxMenuHeight : undefined,
              visibility: contextMenuPos ? 'visible' : 'hidden',
              opacity: ctxReady ? 1 : 0,
              transform: ctxReady ? 'scale(1)' : 'scale(0.96)',
              transformOrigin: contextMenuPos?.placedAbove ? 'bottom center' : 'top center',
              transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
            }}
          >
            {/* Context Menu Actions */}
            <div className="bg-neutral-900/90 border border-white/10 rounded-3xl p-2.5 shadow-2xl backdrop-blur-xl space-y-2">
              {/* Reactions row */}
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 overflow-x-auto scrollbar-none gap-2">
                {['👍', '❤️', '🔥', '😂', '😮', '😢'].map(emoji => (
                  <button 
                    key={emoji} 
                    onClick={() => { handleToggleReaction(selectedContextMsg, emoji); closeContextMenu(); }} 
                    className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/5 active:scale-90 transition-all text-xl"
                  >
                    {emoji}
                  </button>
                ))}
                {isPro && customEmojis.length > 0 && customEmojis.slice(0, 5).map(emoji => (
                  <button 
                    key={emoji.id} 
                    onClick={() => { handleToggleReaction(selectedContextMsg, `[EMOJI:${emoji.image_url}:${emoji.name}]`); closeContextMenu(); }} 
                    className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/5 active:scale-90 transition-all"
                  >
                    <img src={emoji.image_url} alt={emoji.name} className="w-6 h-6 object-contain" />
                  </button>
                ))}
              </div>

              {/* Menu Buttons */}
              <div className="space-y-1">
                <button 
                  onClick={() => { replyToMessage(selectedContextMsg); closeContextMenu(); }} 
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-200 hover:bg-white/5 active:bg-white/10 transition-all text-left"
                >
                  <Reply className="w-4 h-4 text-purple-400" />
                  <span>{t('reply') || 'Reply'}</span>
                </button>

                {selectedContextMsg.sender_id === currentUser.id && !selectedContextMsg.content?.startsWith('[PROFILE_SHARE:') && !selectedContextMsg.content?.startsWith('[POST_SHARE:') && (
                  <button 
                    onClick={() => { handleStartEdit(selectedContextMsg); closeContextMenu(); }} 
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-200 hover:bg-white/5 active:bg-white/10 transition-all text-left"
                  >
                    <Edit3 className="w-4 h-4 text-purple-400" />
                    <span>{t('edit') || 'Edit'}</span>
                  </button>
                )}

                {(selectedContextMsg.sender_id === currentUser.id || isGroupAdmin) && (
                  <button 
                    onClick={() => { handleDelete(selectedContextMsg.id); closeContextMenu(); }} 
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-all text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('delete') || 'Delete'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Read receipts — shown only for the user's own messages. Each reader
                is a single row: avatar · nickname + badges · status + time. */}
            {selectedContextMsg.sender_id === currentUser.id && (() => {
              const readers = getMessageReaders(selectedContextMsg)
              return (
                <div className="bg-neutral-900/90 border border-white/10 rounded-3xl p-3 shadow-2xl backdrop-blur-xl">
                  <h4 className="text-[10px] text-purple-400 font-bold uppercase tracking-wider px-1.5 pt-0.5 pb-2">
                    {t('message_info', 'Информация о сообщении')}
                  </h4>
                  {readers.length === 0 ? (
                    <p className="text-gray-500 italic text-[11px] px-1.5 pb-1">{t('no_views_yet', 'Еще не прочитано')}</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
                      {readers.map((r) => (
                        <div key={r.id} className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-2xl">
                          <ProfileAvatar avatarUrl={r.avatar_url} workCount={r.finished_work_count} size="xs" isPro={r.isPro} avatarFrame={r.avatar_frame} />
                          <div className="flex items-center gap-1 min-w-0 flex-1 notranslate" translate="no">
                            <span className="truncate font-bold text-sm" style={getNicknameStyle(r.nickname_color, '#fff')}>{r.nickname}</span>
                            {r.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                            {r.isPro && (
                              <span className="pro-badge flex-shrink-0">
                                <Gem className="pro-badge-icon" />
                                <span className="pro-badge-text">Pro</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`text-[11px] font-bold ${r.read ? 'text-purple-400' : 'text-gray-500'}`}>
                              {r.read ? t('read', 'Прочитано') : t('delivered', 'Доставлено')}
                            </span>
                            {r.readTime && (
                              <span className="text-[10px] text-gray-500 tabular-nums">
                                {new Date(r.readTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Chat context menu — pin / mute / delete a whole conversation.
          Opens on long-press (phones/PWA) or right-click (desktop), anchored to
          the tapped row in the same liquid-glass style as the message menu. */}
      {chatMenu && createPortal(
        <div
          className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeChatMenu}
          onContextMenu={(e) => { e.preventDefault(); closeChatMenu() }}
        >
          <div
            ref={chatMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: chatMenuPos ? chatMenuPos.menuTop : 0,
              left: chatMenuPos ? chatMenuPos.menuLeft : 0,
              width: chatMenuPos ? chatMenuPos.menuWidth : Math.min(300, (typeof window !== 'undefined' ? window.innerWidth : 320) - 24),
              maxHeight: chatMenuPos ? chatMenuPos.maxMenuHeight : undefined,
              visibility: chatMenuPos ? 'visible' : 'hidden',
              opacity: chatMenuReady ? 1 : 0,
              transform: chatMenuReady ? 'scale(1)' : 'scale(0.96)',
              transformOrigin: chatMenuPos?.placedAbove ? 'bottom center' : 'top center',
              transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
            }}
          >
            <div className="bg-neutral-900/90 border border-white/10 rounded-3xl p-2.5 shadow-2xl backdrop-blur-xl space-y-2">
              {/* Chat preview header */}
              <div className="flex items-center gap-3 px-2 py-1.5 border-b border-white/5">
                {chatMenu.is_group ? (
                  <GroupAvatar avatarUrl={chatMenu.avatar_url} />
                ) : (
                  <ProfileAvatar avatarUrl={chatMenu.avatar_url} workCount={chatMenu.finished_work_count} size="sm" isOnline={isOnline(chatMenu.last_seen)} isPro={chatMenu.isPro} avatarFrame={chatMenu.avatar_frame} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm truncate flex items-center gap-1.5 text-white">
                    {chatMenu.is_group ? (
                      <span className="flex items-center gap-1.5 truncate">
                        <Users className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        {chatMenu.name}
                      </span>
                    ) : (
                      <>
                        <span className="truncate" style={getNicknameStyle(chatMenu.nickname_color, '#fff')}>{chatMenu.nickname}</span>
                        {chatMenu.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {chatMenu.is_group ? (t('group_chat') || 'Group chat') : (t('direct_message') || 'Личные сообщения')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-1">
                <button
                  onClick={() => handleTogglePin(chatMenu)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-200 hover:bg-white/5 active:bg-white/10 transition-all text-left"
                >
                  {chatMenu.is_pinned ? <PinOff className="w-4 h-4 text-purple-400" /> : <Pin className="w-4 h-4 text-purple-400 -rotate-45" />}
                  <span>{chatMenu.is_pinned ? (t('unpin_chat') || 'Открепить чат') : (t('pin_chat') || 'Закрепить чат')}</span>
                </button>

                <button
                  onClick={() => handleToggleMuteFromList(chatMenu)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-200 hover:bg-white/5 active:bg-white/10 transition-all text-left"
                >
                  {chatMenu.is_muted ? <Bell className="w-4 h-4 text-purple-400" /> : <BellOff className="w-4 h-4 text-purple-400" />}
                  <span>{chatMenu.is_muted ? (t('unmute_chat') || 'Включить уведомления') : (t('mute_chat') || 'Заглушить чат')}</span>
                </button>

                <button
                  onClick={() => handleHideChat(chatMenu)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-all text-left"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('delete_chat') || 'Удалить чат'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
