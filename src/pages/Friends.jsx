import { useState, useEffect } from 'react'
import { Search, UserPlus, Check, X, User, UserMinus, BadgeCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { searchUsers, fetchFriends, fetchPendingRequests, respondToFriendRequest, removeFriend, sendFriendRequest, fetchProfileMinimal } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'

export function Friends({ user, onViewProfile }) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  // Load friends and requests
  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    try {
      // Load pending requests
      const requests = await fetchPendingRequests(user.id)
      setPendingRequests(requests || [])

      // Load friends
      const friendsData = await fetchFriends(user.id)
      
      // Map to ensure we have a consistent friendId and profile object
      const formattedFriends = friendsData.map(f => {
        const friendId = f.sender_id === user.id ? f.receiver_id : f.sender_id
        return { ...f, friendId }
      })
      
      setFriends(formattedFriends)
    } catch (error) {
      console.error("Error loading friends data:", error)
    }
  }

  // Handle Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setIsSearching(true)
        try {
          const results = await searchUsers(searchQuery, user.id)
          setSearchResults(results)
        } catch (error) {
          console.error("Search error:", error)
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
      }
    }, 500)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery, user.id])

  const handleAccept = async (requestId) => {
    try {
      await respondToFriendRequest(requestId, 'accepted')
      loadData()
    } catch (error) {
      console.error("Error accepting request:", error)
    }
  }

  const handleReject = async (requestId) => {
    try {
      await respondToFriendRequest(requestId, 'rejected')
      loadData()
    } catch (error) {
      console.error("Error rejecting request:", error)
    }
  }

  const handleRemoveFriend = async (friendshipId) => {
    if (window.confirm(t('remove_friend_confirm') || 'Are you sure you want to remove this friend?')) {
      try {
        await removeFriend(friendshipId)
        loadData()
      } catch (error) {
        console.error("Error removing friend:", error)
      }
    }
  }

  return (
    <div className="w-full space-y-8 pb-12 animate-in fade-in duration-500">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">{t('friends') || 'Friends'}</h1>
          <p className="text-gray-400">{t('friends_subtitle') || 'Find and connect with other visionary artists.'}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search_users') || 'Search users by nickname...'}
          className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white placeholder-gray-500 shadow-xl"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1">{t('search_results') || 'Search Results'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {searchResults.map(result => (
              <div key={result.id} className="glass-card p-4 flex items-center gap-3 group hover:border-purple-500/30 transition-all cursor-pointer" onClick={() => onViewProfile(result.id)}>
                <ProfileAvatar 
                  avatarUrl={result.avatar_url} 
                  workCount={result.finished_work_count} 
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors notranslate truncate flex items-center gap-1" translate="no">
                    {result.nickname || 'Unknown Artist'}
                    {result.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">
                    {result.finished_work_count || 0} {t('works') || 'Works'}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:bg-purple-600 group-hover:text-white transition-all flex-shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && searchQuery.length === 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 pl-1">
            {t('friend_requests') || 'Friend Requests'}
            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-lg">{pendingRequests.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingRequests.map(req => (
              <div key={req.id} className="glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div 
                  className="flex items-center gap-4 cursor-pointer group"
                  onClick={() => onViewProfile(req.sender_id)}
                >
                  <ProfileAvatar 
                    avatarUrl={req.profile?.avatar_url} 
                    workCount={req.profile?.finished_work_count} 
                    size="md"
                  />
                  <div>
                    <h3 className="font-bold text-white group-hover:text-purple-400 notranslate flex items-center gap-2 text-lg" translate="no">
                      {req.profile?.nickname || 'Unknown'}
                      {req.profile?.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">{t('wants_to_be_friends') || 'wants to be friends'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:ml-auto">
                  <button onClick={() => handleAccept(req.id)} className="flex-1 sm:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 uppercase text-xs tracking-widest">
                    <Check className="w-4 h-4" />
                    {t('accept') || 'Accept'}
                  </button>
                  <button onClick={() => handleReject(req.id)} className="px-4 py-3 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 font-bold rounded-2xl transition-all flex items-center justify-center shadow-inner">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      {searchQuery.length === 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-1">{t('my_friends') || 'My Friends'}</h2>
          
          {friends.length === 0 ? (
            <div className="text-center py-12 glass-card border-dashed">
              <UserPlus className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">{t('no_friends_yet') || 'You have not added any friends yet.'}</p>
              <p className="text-sm text-gray-500 mt-2">{t('search_to_add') || 'Use the search bar above to find artists.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {friends.map(friend => (
                <div 
                  key={friend.id} 
                  className="glass-card p-4 flex items-center gap-3 group hover:border-purple-500/30 transition-all cursor-pointer"
                  onClick={() => onViewProfile(friend.friendId)}
                >
                  <ProfileAvatar 
                    avatarUrl={friend.profile?.avatar_url} 
                    workCount={friend.profile?.finished_work_count} 
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors notranslate truncate flex items-center gap-1" translate="no">
                      {friend.profile?.nickname || 'Unknown'}
                      {friend.profile?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                    </h3>
                    <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">
                      {friend.profile?.finished_work_count || 0} {t('works') || 'Works'}
                    </p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleRemoveFriend(friend.id); }}
                    className="w-8 h-8 bg-white/5 hover:bg-red-500/20 text-gray-500 hover:text-red-500 rounded-xl transition-all flex items-center justify-center flex-shrink-0"
                    title={t('remove_friend') || 'Remove friend'}
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
