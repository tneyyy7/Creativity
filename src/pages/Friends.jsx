import { useState, useEffect } from 'react'
import { Search, UserPlus, Check, X, User, UserMinus, BadgeCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { searchUsers, fetchFriends, fetchPendingRequests, respondToFriendRequest, removeFriend, sendFriendRequest, fetchProfileMinimal } from '../lib/supabase'

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
      
      // We only get sender_id back, so let's fetch their basic profiles
      const requestsWithProfiles = await Promise.all(
        requests.map(async (req) => {
          const profile = await fetchProfileMinimal(req.sender_id)
          return { ...req, profile }
        })
      )
      setPendingRequests(requestsWithProfiles)

      // Load friends
      const friendsData = await fetchFriends(user.id)
      const friendsWithProfiles = await Promise.all(
        friendsData.map(async (f) => {
          const isSender = f.sender_id === user.id
          const friendId = isSender ? f.receiver_id : f.sender_id
          const profile = await fetchProfileMinimal(friendId)
          return { ...f, friendId, profile }
        })
      )
      setFriends(friendsWithProfiles)
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
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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
          className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white placeholder-gray-500"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('search_results') || 'Search Results'}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {searchResults.map(result => (
              <div key={result.id} className="glass-card p-4 flex items-center justify-between group hover:border-purple-500/30 transition-all cursor-pointer" onClick={() => onViewProfile(result.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-[14px] bg-[#0c0b11] flex items-center justify-center overflow-hidden shrink-0">
                    {result.avatar_url ? (
                      <img src={result.avatar_url} alt={result.nickname} className="w-full h-full object-cover" />
                    ) : (
                      <User className="text-purple-500 w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors notranslate flex items-center gap-1.5" translate="no">
                      {result.nickname || 'Unknown Artist'}
                      {result.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                    </h3>
                  </div>
                </div>
                <UserPlus className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && searchQuery.length === 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            {t('friend_requests') || 'Friend Requests'}
            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
          </h2>
          <div className="space-y-3">
            {pendingRequests.map(req => (
              <div key={req.id} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div 
                  className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => onViewProfile(req.sender_id)}
                >
                  <div className="w-12 h-12 rounded-[14px] bg-[#0c0b11] flex items-center justify-center overflow-hidden shrink-0">
                    {req.profile?.avatar_url ? (
                      <img src={req.profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="text-purple-500 w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-white group-hover:text-purple-400 notranslate flex items-center gap-1.5" translate="no">
                      {req.profile?.nickname || 'Unknown'}
                      {req.profile?.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
                    </h3>
                    <p className="text-xs text-gray-500">{t('wants_to_be_friends') || 'wants to be friends'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <button onClick={() => handleAccept(req.id)} className="flex-1 sm:flex-none px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    {t('accept') || 'Accept'}
                  </button>
                  <button onClick={() => handleReject(req.id)} className="px-4 py-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-500 font-bold rounded-xl transition-all flex items-center justify-center">
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
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('my_friends') || 'My Friends'}</h2>
          
          {friends.length === 0 ? (
            <div className="text-center py-12 glass-card border-dashed">
              <UserPlus className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">{t('no_friends_yet') || 'You have not added any friends yet.'}</p>
              <p className="text-sm text-gray-500 mt-2">{t('search_to_add') || 'Use the search bar above to find artists.'}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {friends.map(friend => (
                <div key={friend.id} className="glass-card p-4 group relative">
                  <div 
                    className="flex flex-col items-center text-center cursor-pointer transition-transform duration-300 group-hover:-translate-y-1"
                    onClick={() => onViewProfile(friend.friendId)}
                  >
                    <div className="w-20 h-20 rounded-[20px] bg-[#0c0b11] flex items-center justify-center overflow-hidden mb-3 shadow-[0_0_20px_rgba(147,51,234,0.1)]">
                      {friend.profile?.avatar_url ? (
                        <img src={friend.profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="text-purple-500 w-8 h-8" />
                      )}
                    </div>
                    <h3 className="font-bold text-white group-hover:text-purple-400 transition-colors w-full truncate px-2 notranslate flex items-center justify-center gap-1.5" translate="no">
                      {friend.profile?.nickname || 'Unknown'}
                      {friend.profile?.is_verified && <BadgeCheck className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
                    </h3>
                  </div>
                  
                  <button 
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="absolute top-2 right-2 p-2 bg-black/40 backdrop-blur-md rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all z-10"
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
