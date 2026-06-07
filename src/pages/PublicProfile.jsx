import { useState, useEffect } from 'react'
import { ArrowLeft, User, UserPlus, Check, X, Clock, UserMinus, Palette, Lock, BadgeCheck, MessageCircle, Share2, Send, Camera, Shapes, Gem, Box, PenTool, MoreVertical, Flag, Ban, Settings, Calendar, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchPublicProfile, checkFriendshipStatus, sendFriendRequest, fetchPaintings, removeFriend, respondToFriendRequest, fetchFriends, sendMessage, checkFollowStatus, toggleFollow, fetchFollowCounts, blockUser, unblockUser, isUserBlocked, togglePinPainting } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { FollowListModal } from '../components/FollowListModal'
import { ReportModal } from '../components/ReportModal'
import { GlassModal, GlassModalHeader, glassInput } from '../components/GlassModal'
import { getNicknameStyle } from '../lib/nicknameStyle'
import { getBannerGradientCss } from '../lib/bannerGradients'
import { getActiveSocialLinks } from '../lib/socialLinks'
import SmartImage from '../components/SmartImage'

export function PublicProfile({ currentUserId, targetUserId, onBack, onMessage, onViewProfile, onOpenPost, onEditProfile }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(null)
  const [paintings, setPaintings] = useState([])
  const [friendship, setFriendship] = useState(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 })
  const [friendCount, setFriendCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [followModalTab, setFollowModalTab] = useState(null) // 'followers' | 'following' | null
  const [friends, setFriends] = useState([])
  const [sharingSearch, setSharingSearch] = useState('')
  const [showModMenu, setShowModMenu] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)

  useEffect(() => {
    if (!targetUserId) {
      onBack()
      return
    }
    loadData()
    if (currentUserId && currentUserId !== targetUserId) {
      isUserBlocked(currentUserId, targetUserId).then(setIsBlocked)
    }
  }, [targetUserId, currentUserId])

  const handleToggleBlock = async () => {
    setShowModMenu(false)
    if (isBlocked) {
      await unblockUser(currentUserId, targetUserId)
      setIsBlocked(false)
    } else {
      await blockUser(currentUserId, targetUserId)
      setIsBlocked(true)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const profileData = await fetchPublicProfile(targetUserId)
      setProfile(profileData)

      // Fetch paintings
      const paintingsData = await fetchPaintings(targetUserId)
      // Only show finished works or masterpieces (assuming all are public for now)
      setPaintings((paintingsData || []).filter(p => p && p.is_finished))

      // Load follow counts
      fetchFollowCounts(targetUserId)
        .then(setFollowCounts)
        .catch(e => console.error("Error loading follow counts:", e))

      // Load friend count (shown on own profile)
      supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`)
        .eq('status', 'accepted')
        .then(({ count }) => setFriendCount(count || 0))
        .catch(e => console.error("Error loading friend count:", e))

      if (currentUserId && currentUserId !== targetUserId) {
        checkFriendshipStatus(currentUserId, targetUserId)
          .then(setFriendship)
          .catch(e => console.error("Error checking friendship:", e))
        
        checkFollowStatus(currentUserId, targetUserId)
          .then(setIsFollowing)
          .catch(e => console.error("Error checking follow:", e))
      }
    } catch (error) {
      console.error("Error loading public profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleFollowToggle = async () => {
    if (!currentUserId) return
    setActionLoading(true)
    try {
      const followState = await toggleFollow(currentUserId, targetUserId)
      setIsFollowing(followState)
      
      const counts = await fetchFollowCounts(targetUserId)
      setFollowCounts(counts)
    } catch (error) {
      console.error("Error toggling follow:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddFriend = async () => {
    setActionLoading(true)
    try {
      await sendFriendRequest(currentUserId, targetUserId)
      await loadData() // refresh status
    } catch (error) {
      console.error("Error sending request:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!friendship) return
    setActionLoading(true)
    try {
      await respondToFriendRequest(friendship.id, 'accepted')
      await loadData()
    } catch (error) {
      console.error("Error accepting request:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!friendship) return
    setActionLoading(true)
    try {
      await respondToFriendRequest(friendship.id, 'rejected')
      setFriendship(null)
      await loadData()
    } catch (error) {
      console.error("Error rejecting request:", error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveFriend = async () => {
    if (!friendship) return
    if (window.confirm(t('remove_friend_confirm') || 'Are you sure you want to remove this friend?')) {
      setActionLoading(true)
      try {
        await removeFriend(friendship.id)
        setFriendship(null)
        await loadData()
      } catch (error) {
        console.error("Error removing friend:", error)
      } finally {
        setActionLoading(false)
      }
    }
  }

  const handleShare = async () => {
    setActionLoading(true)
    try {
      const friendData = await fetchFriends(currentUserId)
      setFriends(friendData || [])
      setShowShareModal(true)
    } catch (error) {
       console.error("Error fetching friends for sharing:", error)
    } finally {
       setActionLoading(false)
    }
  }

  const sendShareMessage = async (friendProfile) => {
    if (!friendProfile || !profile) return
    setActionLoading(true)
    try {
      const shareData = {
        id: targetUserId,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        is_verified: profile.is_verified,
        work_count: profile.finished_work_count
      }
      const shareText = `[PROFILE_SHARE:${JSON.stringify(shareData)}]`
      await sendMessage(currentUserId, friendProfile.id, shareText)
      alert(t('shared_successfully') || 'Profile shared successfully!')
      setShowShareModal(false)
    } catch (error) {
       console.error("Error sharing profile:", error)
    } finally {
       setActionLoading(false)
    }
  }

  const handlePinToggle = async (e, painting) => {
    e.stopPropagation()
    const nextPinned = !painting.is_pinned
    try {
      await togglePinPainting(painting.id, currentUserId, nextPinned)
      setPaintings(prev => prev.map(p => p.id === painting.id ? { ...p, is_pinned: nextPinned } : p))
    } catch (err) {
      if (err?.message === 'pin_limit') {
        alert(t('pin_limit_reached', 'You can pin up to 3 works. Unpin one first.'))
      } else if (err?.message === 'pin_column_missing') {
        alert(t('feature_not_ready', 'This feature is being rolled out — try again later.'))
      } else {
        console.error('Pin toggle error:', err)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center p-12">
        <p className="text-red-400 font-bold">{t('profile_not_found') || 'Profile not found.'}</p>
        <button onClick={onBack} className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all">
          {t('back') || 'Go Back'}
        </button>
      </div>
    )
  }

  const isSelf = currentUserId === targetUserId
  const isPending = friendship?.status === 'pending'
  const isAccepted = friendship?.status === 'accepted'
  const isReceiver = friendship?.receiver_id === currentUserId

  const joinedDate = profile.created_at
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
    : null

  const SpecIcon = profile.specialization === 'painter' ? Palette
    : profile.specialization === 'photographer' ? Camera
    : profile.specialization === '3D' ? Box
    : profile.specialization === 'designer' ? PenTool
    : Shapes

  const socialLinks = getActiveSocialLinks(profile.social_links)
  const pinnedPaintings = paintings.filter(p => p.is_pinned).slice(0, 3)
  const restPaintings = paintings.filter(p => !pinnedPaintings.some(pin => pin.id === p.id))

  // One card renderer reused by the pinned row and the main grid so modal
  // navigation always gets the real index within the full paintings list.
  const renderWorkCard = (painting) => {
    const idx = paintings.findIndex(p => p.id === painting.id)
    return (
      <div key={painting.id} className="group cursor-pointer" onClick={() => onOpenPost?.(painting.id, painting, paintings, idx, profile)}>
        <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-[#0c0b11] relative">
          <SmartImage
            src={painting.image_url}
            alt={painting.title}
            width={600}
            srcWidths={[300, 600]}
            sizes="(max-width: 1024px) 50vw, 33vw"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
          {painting.is_pinned && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white">
              <Pin className="w-3 h-3 fill-white" /> {t('pinned', 'Pinned')}
            </div>
          )}
          {isSelf && (
            <button
              onClick={(e) => handlePinToggle(e, painting)}
              title={painting.is_pinned ? t('unpin', 'Unpin') : t('pin', 'Pin to profile')}
              aria-label={painting.is_pinned ? t('unpin', 'Unpin') : t('pin', 'Pin to profile')}
              className={`absolute top-2 right-2 z-10 p-2 rounded-full backdrop-blur-md border transition-all active:scale-90 sm:opacity-0 sm:group-hover:opacity-100 ${
                painting.is_pinned
                  ? 'bg-purple-600/80 hover:bg-purple-500 text-white border-purple-400/50 sm:opacity-100'
                  : 'bg-black/45 hover:bg-black/70 text-white border-white/15'
              }`}
            >
              <Pin className={`w-4 h-4 ${painting.is_pinned ? 'fill-white' : ''}`} />
            </button>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 pointer-events-none">
            <h3 className="text-white font-bold text-lg leading-tight mb-2 drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              {painting.title}
            </h3>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id="public-profile-page" className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      
      {!isSelf && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-bold"
        >
          <ArrowLeft className="w-5 h-5" />
          {t('back_to_friends') || 'Back to Friends'}
        </button>
      )}

      <div className="glass-card p-0 relative overflow-hidden">
        {/* Banner */}
        <div className="relative w-full h-32 sm:h-44 md:h-52 lg:h-60">
          {profile.isPro && profile.cover_url ? (
            <img src={profile.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ backgroundImage: getBannerGradientCss(profile.banner_gradient) }}>
              <div className="absolute -top-1/2 right-0 w-2/3 h-[200%] bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-1/2 left-1/4 w-1/2 h-[200%] bg-black/10 rounded-full blur-3xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#12111a]" />

          {/* Top-right icon actions */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 z-20">
            {!isSelf && currentUserId && (
              <div className="relative">
                <button
                  onClick={() => setShowModMenu(v => !v)}
                  className="p-2 sm:p-2.5 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white rounded-full transition-all border border-white/10"
                  title={t('report')}
                >
                  <MoreVertical className="w-4 h-4 sm:w-5 h-5" />
                </button>
                {showModMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowModMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 z-20 glass-card rounded-2xl border-white/10 bg-[#12111a]/95 p-1.5 shadow-2xl">
                      <button
                        onClick={() => { setShowModMenu(false); setShowReport(true) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <Flag className="w-4 h-4" /> {t('report_user')}
                      </button>
                      <button
                        onClick={handleToggleBlock}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Ban className="w-4 h-4" /> {isBlocked ? t('unblock') : t('block')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handleShare}
              className="p-2 sm:p-2.5 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white rounded-full transition-all border border-white/10"
              title={t('share') || 'Share'}
            >
              <Share2 className="w-4 h-4 sm:w-5 h-5" />
            </button>

            {isSelf && onEditProfile && (
              <button
                onClick={onEditProfile}
                className="p-2 sm:p-2.5 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white rounded-full transition-all border border-white/10"
                title={t('edit_profile') || 'Edit profile'}
                aria-label={t('edit_profile') || 'Edit profile'}
              >
                <Settings className="w-4 h-4 sm:w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="relative px-4 sm:px-6 md:px-8 pb-5 sm:pb-6">
          {/* Avatar (overlapping banner) */}
          <div className="-mt-12 sm:-mt-16 md:-mt-[4.5rem] w-fit mb-3">
            <ProfileAvatar
              avatarUrl={profile.avatar_url}
              workCount={profile.finished_work_count}
              size="profile"
              isPro={profile.isPro}
              avatarFrame={profile.avatar_frame}
            />
          </div>

          {/* Name + handle with action buttons */}
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="space-y-0.5 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight notranslate flex items-center gap-2 flex-wrap leading-tight" translate="no">
                <span style={getNicknameStyle(profile.nickname_color)}>
                  {profile.nickname || 'Unknown Artist'}
                </span>
                {profile.is_verified && <BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                {profile.isPro && (
                  <span className="pro-badge pro-badge-lg">
                    <Gem className="pro-badge-icon" />
                    <span className="pro-badge-text">Pro</span>
                  </span>
                )}
              </h1>
              <p className="text-gray-500 font-medium text-sm notranslate" translate="no">@{profile.nickname}</p>
            </div>

            {!isSelf && (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {!isPending && (
                    <button
                      onClick={handleFollowToggle}
                      disabled={actionLoading}
                      title={isFollowing ? t('unfollow', 'Unfollow') : t('follow', 'Follow')}
                      className={`flex items-center justify-center gap-2 h-10 sm:h-11 w-10 sm:w-auto px-0 sm:px-5 font-bold rounded-full transition-all border text-sm active:scale-95 disabled:opacity-60 ${
                        isFollowing
                          ? 'bg-white/5 hover:bg-red-500/10 text-gray-300 hover:text-red-400 border-white/15'
                          : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-500'
                      }`}
                    >
                      <User className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{isFollowing ? t('unfollow', 'Unfollow') : t('follow', 'Follow')}</span>
                    </button>
                  )}

                  {isAccepted && (
                    <button
                      data-lg-fx
                      onClick={() => onMessage?.(profile)}
                      title={t('message') || 'Message'}
                      aria-label={t('message') || 'Message'}
                      className="flex items-center justify-center w-10 sm:w-11 h-10 sm:h-11 bg-white/5 hover:bg-white/10 text-purple-400 rounded-full transition-all border border-white/15 active:scale-95"
                    >
                      <MessageCircle className="w-4 h-4 sm:w-[1.1rem] sm:h-[1.1rem]" />
                    </button>
                  )}

                  {isPending ? (
                    isReceiver ? (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                          onClick={handleAccept}
                          disabled={actionLoading}
                          title={t('accept') || 'Accept'}
                          className="flex items-center justify-center gap-2 h-10 sm:h-11 w-10 sm:w-auto px-0 sm:px-5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-full transition-all text-sm active:scale-95 disabled:opacity-60"
                        >
                          <Check className="w-4 h-4 shrink-0" />
                          <span className="hidden sm:inline">{t('accept') || 'Accept'}</span>
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={actionLoading}
                          title={t('reject') || 'Reject'}
                          aria-label={t('reject') || 'Reject'}
                          className="flex items-center justify-center w-10 sm:w-11 h-10 sm:h-11 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-full transition-all border border-white/15 active:scale-95"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled
                        title={t('request_pending') || 'Request Sent'}
                        className="flex items-center justify-center gap-2 h-10 sm:h-11 w-10 sm:w-auto px-0 sm:px-5 bg-white/5 text-gray-400 font-bold rounded-full border border-white/15 text-sm"
                      >
                        <Clock className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">{t('request_pending') || 'Request Sent'}</span>
                      </button>
                    )
                  ) : isAccepted ? (
                    <button
                      data-lg-fx
                      onClick={handleRemoveFriend}
                      disabled={actionLoading}
                      title={t('remove_friend') || 'Remove Friend'}
                      aria-label={t('remove_friend') || 'Remove Friend'}
                      className="flex items-center justify-center w-10 sm:w-11 h-10 sm:h-11 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-full transition-all border border-white/15 active:scale-95"
                    >
                      <UserMinus className="w-4 h-4 sm:w-[1.1rem] sm:h-[1.1rem]" />
                    </button>
                  ) : (
                    <button
                      onClick={handleAddFriend}
                      disabled={actionLoading}
                      title={t('add_friend') || 'Add Friend'}
                      aria-label={t('add_friend') || 'Add Friend'}
                      className="flex items-center justify-center w-10 sm:w-11 h-10 sm:h-11 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/15 active:scale-95"
                    >
                      <UserPlus className="w-4 h-4 sm:w-[1.1rem] sm:h-[1.1rem]" />
                    </button>
                  )}
            </div>
            )}
          </div>

          {/* Bio */}
          <div className="mt-3">
            {profile.bio ? (
              <p className="text-gray-200 leading-relaxed text-sm sm:text-base max-w-2xl notranslate" translate="no">{profile.bio}</p>
            ) : (
              <p className="text-gray-500 italic text-sm">{t('no_bio') || 'This artist prefers to let their work speak for itself.'}</p>
            )}
          </div>

          {/* Link-in-bio: external social profiles */}
          {socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {socialLinks.map(({ key, label, icon: Icon, url }) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={label}
                  aria-label={label}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 hover:border-white/20 transition-all active:scale-95"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          )}

          {/* Meta row: specialization + joined date */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm text-gray-400">
            {profile.specialization && (
              <span className="inline-flex items-center gap-1.5">
                <SpecIcon className="w-4 h-4 text-purple-400" />
                {t(profile.specialization)}
              </span>
            )}
            {joinedDate && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-500" />
                {t('joined') || 'Joined'} {joinedDate}
              </span>
            )}
            {isAccepted && (
              <span className="inline-flex items-center gap-1.5 text-purple-400 font-semibold">
                <Check className="w-4 h-4" /> {t('friend')}
              </span>
            )}
          </div>

          {/* Counters: Following / Followers / (Friends for self) / Works */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-sm">
            <button
              type="button"
              onClick={() => setFollowModalTab('following')}
              className="group relative -mx-1 overflow-hidden rounded-full px-3.5 py-1.5 text-gray-400 border border-transparent transition-all duration-300 hover:text-white hover:border-white/20 hover:bg-white/[0.08] hover:backdrop-blur-md hover:shadow-[0_8px_24px_-8px_rgba(168,85,247,0.5)]"
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 via-white/15 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative"><strong className="text-white font-black">{followCounts.following}</strong> {t('following') || 'Following'}</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowModalTab('followers')}
              className="group relative -mx-1 overflow-hidden rounded-full px-3.5 py-1.5 text-gray-400 border border-transparent transition-all duration-300 hover:text-white hover:border-white/20 hover:bg-white/[0.08] hover:backdrop-blur-md hover:shadow-[0_8px_24px_-8px_rgba(168,85,247,0.5)]"
            >
              <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 via-white/15 to-white/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="relative"><strong className="text-white font-black">{followCounts.followers}</strong> {t('followers') || 'Followers'}</span>
            </button>
            {isSelf && (
              <span className="text-gray-400">
                <strong className="text-white font-black">{friendCount}</strong> {t('friends') || 'Friends'}
              </span>
            )}
            <span className="text-gray-400">
              <strong className="text-white font-black">{profile.finished_work_count || 0}</strong> {t('works') || 'Works'}
            </span>
          </div>
        </div>
      </div>

      {/* Pinned works (up to 3) */}
      {(!profile.is_private || isSelf || isAccepted) && pinnedPaintings.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Pin className="text-purple-500 w-5 h-5 fill-purple-500" />
            {t('pinned', 'Pinned')}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {pinnedPaintings.map(renderWorkCard)}
          </div>
        </div>
      )}

      {/* Public Gallery */}
      <div className="space-y-6">
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Palette className="text-purple-500 w-6 h-6" />
          {t('portfolio') || 'Portfolio'}
        </h2>

        {profile.is_private && !isSelf && !isAccepted ? (
          <div className="glass-card p-12 text-center border-dashed">
            <Lock className="w-12 h-12 text-purple-500 mx-auto mb-4" />
            <h3 className="text-white font-bold text-xl mb-2">{t('account_is_private') || 'This Account is Private'}</h3>
            <p className="text-gray-400 font-medium">{t('account_is_private_desc') || 'Become friends to see their portfolio.'}</p>
          </div>
        ) : paintings.length === 0 ? (
          <div className="glass-card p-12 text-center border-dashed">
            <Palette className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">{t('no_public_works') || 'No finished works available yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {restPaintings.map(renderWorkCard)}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <GlassModal onClose={() => setShowShareModal(false)} z="z-[300]">
            <GlassModalHeader
              icon={<Share2 className="w-4 h-4" />}
              title={t('share_with_friends', 'Share with friends')}
              subtitle={t('share', 'Share')}
            />

            <input
              type="text"
              placeholder={t('search_friends', 'Search friends...')}
              value={sharingSearch}
              onChange={(e) => setSharingSearch(e.target.value)}
              className={`${glassInput} mb-4`}
            />

            <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
              {friends.filter(f => f?.profile && (f.profile.nickname || '').toLowerCase().includes((sharingSearch || '').toLowerCase())).map(friendItem => (
                <div key={friendItem.id} className="bg-white/[0.03] hover:bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between px-3 py-2.5 rounded-2xl group">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar avatarUrl={friendItem.profile?.avatar_url} workCount={friendItem.profile?.finished_work_count} size="sm" isPro={friendItem.profile?.isPro} avatarFrame={friendItem.profile?.avatar_frame} />
                     <span className="text-white font-semibold text-xs flex items-center gap-1.5" style={{ color: friendItem.profile?.nickname_color || undefined }}>
                      {friendItem.profile?.nickname || 'Unknown'}
                      {friendItem.profile?.is_verified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                      )}
                      {friendItem.profile?.isPro && (
                        <span className="pro-badge">
                          <Gem className="pro-badge-icon" />
                          <span className="pro-badge-text">Pro</span>
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => sendShareMessage(friendItem.profile)}
                    disabled={actionLoading}
                    className="p-2 bg-purple-600/90 hover:bg-purple-500 text-white rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50 active:scale-95"
                    type="button"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {friends.length === 0 && (
                <p className="text-center text-gray-500 text-xs py-6">{t('no_friends_found', 'No friends found.')}</p>
              )}
            </div>
        </GlassModal>
      )}

      {followModalTab && (
        <FollowListModal
          userId={targetUserId}
          initialTab={followModalTab}
          onClose={() => setFollowModalTab(null)}
          onViewProfile={onViewProfile}
        />
      )}

      {showReport && (
        <ReportModal
          targetType="user"
          targetId={targetUserId}
          reporterId={currentUserId}
          onClose={() => setShowReport(false)}
        />
      )}

    </div>
  )
}
