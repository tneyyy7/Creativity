import { useState, useEffect } from 'react'
import { ArrowLeft, User, UserPlus, Check, X, Clock, UserMinus, Palette, Lock, BadgeCheck, MessageCircle, Share2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchPublicProfile, checkFriendshipStatus, sendFriendRequest, fetchPaintings, removeFriend, respondToFriendRequest, fetchFriends, sendMessage } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'

export function PublicProfile({ currentUserId, targetUserId, onBack, onMessage, onViewProfile, onOpenPost }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(null)
  const [paintings, setPaintings] = useState([])
  const [friendship, setFriendship] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [friends, setFriends] = useState([])
  const [sharingSearch, setSharingSearch] = useState('')

  useEffect(() => {
    if (!targetUserId) {
      onBack()
      return
    }
    loadData()
  }, [targetUserId, currentUserId])

  const loadData = async () => {
    setLoading(true)
    try {
      const profileData = await fetchPublicProfile(targetUserId)
      setProfile(profileData)

      // Fetch paintings
      const paintingsData = await fetchPaintings(targetUserId)
      // Only show finished works or masterpieces (assuming all are public for now)
      setPaintings((paintingsData || []).filter(p => p && p.is_finished))

      if (currentUserId && currentUserId !== targetUserId) {
        const relation = await checkFriendshipStatus(currentUserId, targetUserId)
        setFriendship(relation)
      }
    } catch (error) {
      console.error("Error loading public profile:", error)
    } finally {
      setLoading(false)
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

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-bold"
      >
        <ArrowLeft className="w-5 h-5" />
        {t('back_to_friends') || 'Back to Friends'}
      </button>

      <div className="glass-card p-6 md:p-10 relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

        <button 
          onClick={handleShare}
          className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-purple-400 rounded-2xl transition-all border border-white/5 z-10"
          title={t('share') || 'Share'}
        >
          <Share2 className="w-5 h-5" />
        </button>

        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-10">
          <ProfileAvatar 
            avatarUrl={profile.avatar_url} 
            workCount={profile.finished_work_count} 
            size="xl"
          />
          
          <div className="flex-1 text-center md:text-left space-y-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight notranslate flex items-center justify-center md:justify-start gap-2" translate="no">
                {profile.nickname || 'Unknown Artist'}
                {profile.is_verified && <BadgeCheck className="w-6 h-6 text-purple-400 fill-purple-400/20" />}
              </h1>
              {isAccepted && <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-wider rounded-lg mt-2"><Check className="w-3 h-3"/> {t('friend') || 'Friend'}</span>}
            </div>

            {profile.bio ? (
              <p className="text-gray-300 leading-relaxed text-lg max-w-2xl notranslate" translate="no">{profile.bio}</p>
            ) : (
              <p className="text-gray-500 italic">{t('no_bio') || 'This artist prefers to let their work speak for itself.'}</p>
            )}

            {!isSelf && (
              <div className="pt-4 flex flex-wrap gap-3 items-center justify-center md:justify-start">
                    {isAccepted && (
                      <button 
                        onClick={() => onMessage?.(profile)}
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all flex items-center gap-2 mx-auto md:mx-0 border border-white/10"
                      >
                        <MessageCircle className="w-5 h-5 text-purple-400" />
                        {t('message') || 'Message'}
                      </button>
                    )}
                    {isPending ? (
                  isReceiver ? (
                    <div className="flex flex-col sm:flex-row items-center gap-3 justify-center md:justify-start">
                      <span className="text-gray-400 font-bold flex items-center gap-2 mb-2 sm:mb-0">
                        <User className="w-5 h-5 text-purple-400" />
                        {t('sent_you_request') || 'Sent you a request'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleAccept}
                          disabled={actionLoading}
                          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          {t('accept') || 'Accept'}
                        </button>
                        <button 
                          onClick={handleReject}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 font-bold rounded-xl transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      disabled
                      className="px-6 py-3 bg-white/5 text-gray-400 font-bold rounded-xl flex items-center gap-2 mx-auto md:mx-0 border border-white/10"
                    >
                      <Clock className="w-5 h-5" />
                      {t('request_pending') || 'Request Sent'}
                    </button>
                  )
                ) : isAccepted ? (
                  <button 
                    onClick={handleRemoveFriend}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 font-bold rounded-xl transition-all flex items-center gap-2 mx-auto md:mx-0"
                  >
                    <UserMinus className="w-5 h-5" />
                    {t('remove_friend') || 'Remove Friend'}
                  </button>
                ) : (
                  <button 
                    onClick={handleAddFriend}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all flex items-center gap-2 mx-auto md:mx-0 shadow-lg shadow-purple-900/20 disabled:opacity-50"
                  >
                    <UserPlus className="w-5 h-5" />
                    {t('add_friend') || 'Add Friend'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {paintings.map((painting, idx) => (
              <div key={painting.id} className="group cursor-pointer" onClick={() => onOpenPost?.(painting.id, painting, paintings, idx)}>
                <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-[#0c0b11] relative">
                  <img
                    src={painting.image_url}
                    alt={painting.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                    <h3 className="text-white font-bold text-lg leading-tight mb-2 drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                      {painting.title}
                    </h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowShareModal(false)}></div>
          <div className="glass-card w-full max-w-md p-6 relative animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-white">{t('share_with_friends') || 'Share with friends'}</h3>
              <button 
                onClick={() => setShowShareModal(false)} 
                className="p-2 text-gray-400 hover:text-white transition-colors"
                type="button"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative mb-6">
              <input 
                type="text"
                placeholder={t('search_friends') || 'Search friends...'}
                value={sharingSearch}
                onChange={(e) => setSharingSearch(e.target.value)}
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:border-purple-500/50 outline-none"
              />
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {friends.filter(f => f?.profile && (f.profile.nickname || '').toLowerCase().includes((sharingSearch || '').toLowerCase())).map(friendItem => (
                <div key={friendItem.id} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all group">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar avatarUrl={friendItem.profile?.avatar_url} workCount={friendItem.profile?.finished_work_count} size="sm" />
                    <span className="text-white font-bold">{friendItem.profile?.nickname || 'Unknown'}</span>
                  </div>
                  <button 
                    onClick={() => sendShareMessage(friendItem.profile)}
                    disabled={actionLoading}
                    className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    type="button"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {friends.length === 0 && (
                <p className="text-center text-gray-500 py-6">{t('no_friends_found') || 'No friends found.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
