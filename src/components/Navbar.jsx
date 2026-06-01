import { LogOut, Settings, Bell, Menu, BadgeCheck, Languages, Check, X, User, Heart, MessageCircle, Bookmark, Gem } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProfileAvatar } from './ProfileAvatar'
import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchPendingRequests, respondToFriendRequest, fetchPostNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteAllNotifications, updatePreferredLang } from '../lib/supabase'
import { getNicknameStyle } from '../lib/nicknameStyle'

export function Navbar({ nickname, avatarUrl, userEmail, user, onToggleSidebar, onProfileClick, onFriendsClick, isVerified, workCount, onOpenPost, isPro, avatarFrame, nicknameColor }) {
  const { t, i18n } = useTranslation()

  const getNotifConfig = (type) => {
    switch (type) {
      case 'like':
        return {
          bgClass: 'bg-red-500',
          icon: <Heart className="w-2.5 h-2.5 text-white fill-white" />,
          text: t('liked_your_post', 'liked your post')
        }
      case 'comment':
        return {
          bgClass: 'bg-blue-500',
          icon: <MessageCircle className="w-2.5 h-2.5 text-white" />,
          text: t('commented_on_your_post', 'commented on your post')
        }
      case 'bookmark':
        return {
          bgClass: 'bg-purple-600',
          icon: <Bookmark className="w-2.5 h-2.5 text-white fill-white" />,
          text: t('bookmarked_your_post', 'added your work to bookmarks')
        }
      case 'follow':
        return {
          bgClass: 'bg-green-600',
          icon: <User className="w-2.5 h-2.5 text-white" />,
          text: t('followed_you', 'followed you')
        }
      case 'friend_accept':
        return {
          bgClass: 'bg-amber-500',
          icon: <Check className="w-2.5 h-2.5 text-white" />,
          text: t('accepted_friend_request', 'accepted your friend request')
        }
      case 'story_like':
        return {
          bgClass: 'bg-red-500',
          icon: <Heart className="w-2.5 h-2.5 text-white fill-white" />,
          text: t('liked_your_story', 'оценил(а) вашу историю ❤️')
        }
      case 'story_comment':
        return {
          bgClass: 'bg-blue-500',
          icon: <MessageCircle className="w-2.5 h-2.5 text-white" />,
          text: t('commented_on_your_story', 'ответил(а) на вашу историю 💬')
        }
      default:
        return {
          bgClass: 'bg-gray-500',
          icon: <Bell className="w-2.5 h-2.5 text-white" />,
          text: t('new_notification', 'sent you a notification')
        }
    }
  }

  const [showLangs, setShowLangs] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [postNotifications, setPostNotifications] = useState([])
  const [activeNotifTab, setActiveNotifTab] = useState('all') // 'all' | 'requests' | 'activity'
  
  const notifRef = useRef(null)
  const langRef = useRef(null)
  const prevShowNotifications = useRef(showNotifications)

  const toggleLanguage = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('app_lang', code)
    // Persist to the profile so push notifications arrive in the user's site language
    updatePreferredLang(user?.id, code)
    setShowLangs(false)
  }

  // Sync the current site language into the profile on load so existing users
  // get a stored value used by the push-notification edge function.
  useEffect(() => {
    if (!user?.id) return
    const lang = i18n.language || localStorage.getItem('app_lang') || 'en'
    updatePreferredLang(user.id, lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const loadAll = useCallback(async () => {
    if (!user?.id) return
    try {
      const requests = await fetchPendingRequests(user.id).catch(e => {
        console.error("fetchPendingRequests error:", e)
        return []
      })
      const notifs = await fetchPostNotifications(user.id).catch(e => {
        console.error("fetchPostNotifications error:", e)
        return []
      })
      
      setPendingRequests(requests || [])
      setPostNotifications((notifs || []).filter(n => n.type !== 'friend_request'))
    } catch (err) {
      console.error("Error fetching notifications:", err)
    }
  }, [user?.id])

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, 15000)
    return () => clearInterval(interval)
  }, [loadAll])

  // Auto-mark notifications as read when pane closes
  useEffect(() => {
    if (prevShowNotifications.current && !showNotifications && user?.id) {
      const hasUnread = postNotifications.some(n => !n.is_read)
      if (hasUnread) {
        markAllNotificationsAsRead(user.id)
        setPostNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      }
    }
    prevShowNotifications.current = showNotifications
  }, [showNotifications, user?.id])

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (langRef.current && !langRef.current.contains(event.target)) {
        setShowLangs(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAction = async (id, status) => {
    try {
      await respondToFriendRequest(id, status)
      setPendingRequests(prev => prev.filter(r => r.id !== id))
      
      // Also mark the associated notification as read if it exists
      const associatedNotif = postNotifications.find(n => n.request_id === id)
      if (associatedNotif) {
        await markNotificationAsRead(associatedNotif.id)
        setPostNotifications(prev => prev.filter(n => n.id !== associatedNotif.id))
      }
    } catch (err) {
      console.error("Error responding to request:", err)
    }
  }

  const unreadPostNotifs = postNotifications.filter(n => !n.is_read).length
  const totalCount = pendingRequests.length + unreadPostNotifs

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

  const handleNotifClick = async (notif) => {
    if (onOpenPost && notif.painting_id) {
      setShowNotifications(false)
      onOpenPost(notif.painting_id, notif.painting, null, 0, {
        id: user?.id,
        nickname,
        avatar_url: avatarUrl,
        is_verified: isVerified,
        finished_work_count: workCount,
        isPro,
        avatar_frame: avatarFrame,
        nickname_color: nicknameColor
      })
    }
    
    // Mark as read in DB and local state
    try {
      await markNotificationAsRead(notif.id)
      setPostNotifications(prev => prev.filter(n => n.id !== notif.id))
    } catch (err) {
      console.error("Error marking notification as read:", err)
    }
  }

  const handleClearAll = async () => {
    if (!user?.id) return
    try {
      // We do NOT clear local state optimistically here because if the DB 
      // deletion fails (e.g. RLS issues), the items will come back on next sync.
      await deleteAllNotifications(user.id)
      setPostNotifications([])
    } catch (err) {
      console.error("Error clearing notifications:", err)
      // If error occurs (like no DELETE policy), alert the user in console at least
    }
  }

  // Build filtered list
  const filteredItems = []
  if (activeNotifTab === 'all' || activeNotifTab === 'requests') {
    pendingRequests.forEach(r => filteredItems.push({ ...r, _type: 'request' }))
  }
  if (activeNotifTab === 'all' || activeNotifTab === 'activity') {
    postNotifications
      .filter(n => n.type !== 'friend_request')
      .forEach(n => filteredItems.push({ ...n, _type: n.type }))
  }
  // Sort: requests first, then by time
  filteredItems.sort((a, b) => {
    if (a._type === 'request' && b._type !== 'request') return -1
    if (a._type !== 'request' && b._type === 'request') return 1
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })

  return (
    <header 
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(var(--navbar-height, 5rem) + env(safe-area-inset-top))'
      }}
      className="[--navbar-height:5rem] md:[--navbar-height:6rem] px-4 md:px-10 flex items-center justify-between border-b border-white/[0.04] bg-[#0c0b11]/80 backdrop-blur-md sticky top-0 z-40 relative"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden md:block">
           <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t('visionary_artist')}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-8">
        <div className="flex items-center gap-2">

          <div className="sm:relative" ref={notifRef}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications)
                setShowLangs(false)
              }}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-white rounded-2xl transition-all relative"
            >
              <Bell className="w-5 h-5" />
              {totalCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] border-2 border-[#0c0b11] flex items-center justify-center">
                  {totalCount > 99 ? '99+' : totalCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-4 sm:right-0 mt-4 w-[calc(100vw-2rem)] sm:w-[360px] bg-[#0c0b11] border border-white/10 rounded-3xl z-50 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 max-h-[80vh]">
                  {/* Header */}
                  <div className="p-4 border-b border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('notifications')}</h3>
                        {unreadPostNotifs > 0 && (
                          <span className="px-1.5 py-0.5 bg-purple-500/10 rounded-md border border-purple-500/20 text-[9px] font-black text-purple-500">
                            {unreadPostNotifs}
                          </span>
                        )}
                      </div>
                      {(postNotifications.length > 0 || pendingRequests.length > 0) && (
                        <button 
                          onClick={handleClearAll}
                          className="text-[10px] font-bold text-gray-500 hover:text-purple-400 transition-colors uppercase tracking-tighter"
                        >
                          {t('clear_all', 'Clear all')}
                        </button>
                      )}
                    </div>
                    {/* Tabs */}
                    <div className="flex gap-2">
                      {[
                        { key: 'all', label: t('all', 'All') },
                        { key: 'requests', label: t('requests', 'Requests'), count: pendingRequests.length },
                        { key: 'activity', label: t('activity', 'Activity'), count: postNotifications.length },
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveNotifTab(tab.key)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                            activeNotifTab === tab.key
                              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                              : 'bg-white/5 text-gray-500 hover:text-gray-300 border border-white/5'
                          }`}
                        >
                          {tab.label}
                          {tab.count > 0 && (
                            <span className="min-w-[16px] h-[16px] px-1 bg-red-500/80 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                              {tab.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Items */}
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    {filteredItems.length > 0 ? (
                      filteredItems.map((item) => {
                        if (item._type === 'request') {
                          // Friend request
                          return (
                            <div key={item.id} className="p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors border-b border-white/[0.03] last:border-0">
                              <ProfileAvatar
                                avatarUrl={item.profile?.avatar_url}
                                workCount={item.profile?.finished_work_count ?? 0}
                                size="sm"
                                isPro={item.profile?.isPro}
                                avatarFrame={item.profile?.avatar_frame}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate notranslate flex items-center gap-1.5" translate="no">
                                  <span style={getNicknameStyle(item.profile?.nickname_color, '#fff')}>
                                    {item.profile?.nickname}
                                  </span>
                                  {item.profile?.is_verified && (
                                    <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                                  )}
                                  {item.profile?.isPro && (
                                    <span className="pro-badge">
                                      <Gem className="pro-badge-icon" />
                                      <span className="pro-badge-text">Pro</span>
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-gray-500 font-medium truncate">{t('wants_to_be_friends')}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => handleAction(item.id, 'accepted')}
                                  className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-purple-900/40"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleAction(item.id, 'rejected')}
                                  className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 transition-all"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )
                        }

                        // Activity notification (like, comment, follow, bookmark, friend_accept)
                        const notifConfig = getNotifConfig(item.type)
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleNotifClick(item)}
                            className={`p-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.03] last:border-0 cursor-pointer group ${!item.is_read ? 'bg-white/[0.02]' : ''}`}
                          >
                            {/* Actor avatar */}
                            <div className="relative flex-shrink-0">
                              <ProfileAvatar
                                avatarUrl={item.actor?.avatar_url}
                                workCount={item.actor?.finished_work_count ?? 0}
                                size="sm"
                                isPro={item.actor?.isPro}
                                avatarFrame={item.actor?.avatar_frame}
                              />
                              {/* Type badge */}
                              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0c0b11] ${notifConfig.bgClass}`}>
                                {notifConfig.icon}
                              </div>
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs leading-snug">
                                <span className="font-bold notranslate group-hover:text-purple-400 transition-colors flex items-center gap-1.5 inline-flex" translate="no">
                                  <span style={getNicknameStyle(item.actor?.nickname_color, '#fff')}>
                                    {item.actor?.nickname || 'Someone'}
                                  </span>
                                  {item.actor?.is_verified && (
                                    <BadgeCheck className="w-3 h-3 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                                  )}
                                  {item.actor?.isPro && (
                                    <span className="pro-badge">
                                      <Gem className="pro-badge-icon" />
                                      <span className="pro-badge-text">Pro</span>
                                    </span>
                                  )}
                                </span>
                                {' '}
                                <span className="text-white">{notifConfig.text}</span>
                              </p>
                              {((item.type === 'comment' || item.type === 'story_comment') && item.content) && (
                                <p className="text-[10px] text-gray-500 truncate mt-0.5 max-w-[180px]">
                                  "{item.content.split('___STORY_ID:')[0]}"
                                </p>
                              )}
                              <p className="text-[10px] text-gray-600 mt-0.5">{formatTime(item.created_at)}</p>
                            </div>

                            {/* Painting thumbnail */}
                            {item.painting?.image_url && (
                              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 group-hover:border-purple-500/30 transition-colors">
                                <img src={item.painting.image_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="p-10 text-center">
                        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
                          <Bell className="w-6 h-6 text-gray-600" />
                        </div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('no_notifications')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          <div className="sm:relative" ref={langRef}>
            <button
              onClick={() => {
                setShowLangs(!showLangs)
                setShowNotifications(false)
              }}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-white rounded-2xl transition-all"
            >
              <Languages className="w-5 h-5" />
            </button>

            {showLangs && (
              <div className="absolute right-4 sm:right-0 mt-4 w-52 bg-[#0c0b11] border border-white/10 rounded-3xl z-50 py-3 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                  {['en', 'ru', 'it'].map((code) => (
                    <button
                      key={code}
                      onClick={() => toggleLanguage(code)}
                      className="w-full flex items-center gap-4 px-6 py-4 text-sm font-bold text-gray-400 hover:bg-white/[0.03] hover:text-purple-400 transition-all text-left group"
                    >
                      <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{code === 'en' ? '🇺🇸' : code === 'ru' ? '🇷🇺' : '🇮🇹'}</span>
                      <span className="tracking-tight">{code === 'en' ? 'English' : code === 'ru' ? 'Русский' : 'Italiano'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4 md:pl-8 md:border-l md:border-white/5">
          <div
            onClick={onProfileClick}
            className="flex items-center gap-3 pl-3 py-1.5 pr-1.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer group"
          >
            <div className="hidden sm:flex flex-col items-end">
              <span 
                className="text-xs font-black text-white notranslate flex items-center gap-1.5" 
                translate="no"
              >
                <span style={getNicknameStyle(nicknameColor)}>
                  {nickname}
                </span>
                {isVerified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                {isPro && (
                  <span className="pro-badge">
                    <Gem className="pro-badge-icon" />
                    <span className="pro-badge-text">Pro</span>
                  </span>
                )}
              </span>
              <span className="text-[10px] font-bold text-gray-500 truncate max-w-[120px]">{userEmail}</span>
            </div>

            <ProfileAvatar
              avatarUrl={avatarUrl}
              workCount={workCount}
              size="md"
              isPro={isPro}
              avatarFrame={avatarFrame}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
