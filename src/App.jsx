import { useState, useEffect, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/Navbar'
import { supabase, fetchProfile, updateLastSeen, fetchSubscriptionStatus } from './lib/supabase'
import { Auth } from './pages/Auth'
import { PostViewerModal } from './components/PostViewerModal'
import { initOneSignal } from './lib/pwa'

// Lazy-load page components so each route ships in its own chunk
// instead of bloating the initial bundle.
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Gallery = lazy(() => import('./pages/Gallery').then(m => ({ default: m.Gallery })))
const Productivity = lazy(() => import('./pages/Productivity').then(m => ({ default: m.Productivity })))
const Ranks = lazy(() => import('./pages/Ranks').then(m => ({ default: m.Ranks })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const PublicProfile = lazy(() => import('./pages/PublicProfile').then(m => ({ default: m.PublicProfile })))
const Messages = lazy(() => import('./pages/Messages').then(m => ({ default: m.Messages })))
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })))
const Friends = lazy(() => import('./pages/Friends').then(m => ({ default: m.Friends })))
const Bookmarks = lazy(() => import('./pages/Bookmarks').then(m => ({ default: m.Bookmarks })))
const Explore = lazy(() => import('./pages/Explore').then(m => ({ default: m.Explore })))
const Subscription = lazy(() => import('./pages/Subscription').then(m => ({ default: m.Subscription })))

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('creativity_active_tab') || 'dashboard')
  const [theme, setTheme] = useState('dark')
  const [nickname, setNickname] = useState('Artist User')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [isVerified, setIsVerified] = useState(false)
  const [specialization, setSpecialization] = useState('painter')
  const [workCount, setWorkCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [targetUserId, setTargetUserId] = useState(() => localStorage.getItem('creativity_target_user_id') || null) // Used for viewing public profiles
  const [postViewer, setPostViewer] = useState(null)
  const [isPro, setIsPro] = useState(false)
  const [avatarFrame, setAvatarFrame] = useState('default')
  const [nicknameColor, setNicknameColor] = useState('')

  useEffect(() => {
    const syncUser = (currUser) => {
      if (currUser) {
        setUser(currUser)
        const meta = currUser.user_metadata
        
        // Fetch full profile info to get avatar and other DB-specific fields
        fetchProfile(currUser.id)
          .then((data) => {
            if (data) {
              setNickname(data.nickname || meta?.full_name || currUser.email?.split('@')[0])
              setAvatarUrl(data.avatar_url)
              setIsVerified(data.is_verified || false)
              setSpecialization(data.specialization || 'painter')
              setWorkCount(data.finished_work_count || 0)
              setAvatarFrame(data.avatar_frame || 'default')
              setNicknameColor(data.nickname_color || '')
            }
          })

        // Fetch subscription status
        fetchSubscriptionStatus(currUser.id)
          .then((sub) => {
            setIsPro(sub.isPro)
          })
          .catch(err => console.error('Subscription status fetch error:', err))
      } else {
        setUser(null)
        setNickname('Artist User')
        setAvatarUrl(null)
        setIsVerified(false)
        setSpecialization('painter')
        setWorkCount(0)
        setIsPro(false)
        setAvatarFrame('default')
        setNicknameColor('')
      }
      setLoading(false)
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncUser(session?.user)
    }).catch(err => {
      console.error('Session fetch error:', err)
      setLoading(false)
    })

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      initOneSignal(user.id)
      
      // Update online status immediately and setup interval
      updateLastSeen(user.id)
      const interval = setInterval(() => {
        updateLastSeen(user.id)
      }, 60000) // 1 minute
      
      return () => clearInterval(interval)
    }
  }, [user])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  useEffect(() => {
    localStorage.setItem('creativity_active_tab', activeTab)
  }, [activeTab])

  useEffect(() => {
    if (targetUserId) {
      localStorage.setItem('creativity_target_user_id', targetUserId)
    } else {
      localStorage.removeItem('creativity_target_user_id')
    }
  }, [targetUserId])

  // const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  
  const handleLogout = async () => {
    try {
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date(Date.now() - 15 * 60 * 1000).toISOString() })
          .eq('id', user.id)
      }
    } catch (e) {
      console.error("Error setting offline status:", e)
    }
    localStorage.removeItem('creativity_active_tab')
    localStorage.removeItem('creativity_target_user_id')
    await supabase.auth.signOut()
    setUser(null)
  }

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  if (loading) {
    return null
  }
  if (!user) {
    return <Auth onAuth={setUser} />
  }

  const closeSidebar = () => setIsSidebarOpen(false)

  return (
    <div className={`app-container ${theme === 'light' ? 'light-mode' : ''}`}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(id) => { setActiveTab(id); closeSidebar(); }} 
        onLogout={handleLogout} 
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        currentUser={user}
        isPro={isPro}
      />
      <div className="main-content">
        <Navbar 
          activeTab={activeTab}
          user={user}
          nickname={nickname}
          avatarUrl={avatarUrl}
          isVerified={isVerified}
          isPro={isPro}
          avatarFrame={avatarFrame}
          nicknameColor={nicknameColor}
          workCount={workCount}
          userEmail={user?.email} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          onProfileClick={() => setActiveTab('profile')}
          onFriendsClick={() => setActiveTab('friends')}
          onOpenPost={(id, painting, collection, index, profile) => setPostViewer({ 
            painting, 
            paintings: collection || [painting], 
            index: index ?? 0,
            externalProfile: profile
          })}
        />
        <main className={`flex-1 ${activeTab === 'messages' ? 'overflow-hidden p-3 md:p-4' : 'overflow-y-auto p-4 md:p-10'} custom-scrollbar flex flex-col`}>
         <div key={activeTab} className="tab-transition flex-1 flex flex-col min-h-0">
         <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>}>
          {activeTab === 'dashboard' && (
            <Dashboard 
              nickname={nickname} 
              isVerified={isVerified} 
              isPro={isPro} 
              onNavigate={setActiveTab} 
              isViewerOpen={!!postViewer}
              onOpenPost={(id, painting, collection, index) => setPostViewer({ 
                painting, 
                paintings: collection || [painting], 
                index: index ?? 0,
                isOwnGallery: true
              })}
            />
          )}
          {activeTab === 'explore' && (
            <Explore 
              currentUser={user}
              nickname={nickname}
              avatarUrl={avatarUrl}
              isPro={isPro}
              onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
              onOpenPost={(id, painting, collection, index, profile) => setPostViewer({ 
                painting, 
                paintings: collection || [painting], 
                index: index ?? 0,
                externalProfile: profile
              })}
            />
          )}
          {activeTab === 'gallery' && (
            <Gallery 
              onOpenPost={(id, painting, collection, index) => setPostViewer({ 
                painting, 
                paintings: collection || [painting], 
                index: index ?? 0,
                isOwnGallery: true
              })} 
            />
          )}
          {activeTab === 'bookmarks' && (
            <Bookmarks 
              onOpenPost={(id, painting, collection, index, profile) => setPostViewer({ 
                painting, 
                paintings: collection || [painting], 
                index: index ?? 0,
                externalProfile: profile
              })}
            />
          )}
          {activeTab === 'productivity' && <Productivity />}
          {activeTab === 'ranks' && <Ranks />}
          {activeTab === 'profile' && <Profile 
            user={user} 
            nickname={nickname} 
            setNickname={setNickname} 
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            isVerified={isVerified}
            specialization={specialization}
            setSpecialization={setSpecialization}
            workCount={workCount}
            isPro={isPro}
            avatarFrame={avatarFrame}
            nicknameColor={nicknameColor}
          />}
          {activeTab === 'friends' && <Friends 
            user={user} 
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }} 
          />}
          { activeTab === 'public_profile' && <PublicProfile 
            currentUserId={user?.id}
            targetUserId={targetUserId}
            onBack={() => setActiveTab('friends')}
            onMessage={() => setActiveTab('messages')}
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
            onOpenPost={(id, painting, collection, index, profile) => setPostViewer({ 
              painting, 
              paintings: collection || [painting], 
              index: index ?? 0,
              externalProfile: profile
            })}
          />}
          {activeTab === 'messages' && <Messages 
            currentUser={user} 
            isPro={isPro}
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
          />}
          {activeTab === 'subscription' && <Subscription />}
          {activeTab === 'settings' && <Settings userEmail={user?.email} />}
         </Suspense>
         </div>
        </main>
      </div>

      {postViewer && (
        <PostViewerModal
          paintings={postViewer.paintings}
          initialIndex={postViewer.index}
          currentUserId={user?.id}
          authorProfile={postViewer.isOwnGallery ? {
            id: user?.id,
            nickname: nickname,
            avatar_url: avatarUrl,
            is_verified: isVerified,
            specialization: specialization,
            finished_work_count: workCount,
            isPro: isPro
          } : (postViewer.externalProfile || postViewer.painting?.user || postViewer.painting?.profiles || null)}
          onClose={() => setPostViewer(null)}
          onViewProfile={(id) => {
            setTargetUserId(id);
            setActiveTab('public_profile');
            setPostViewer(null);
          }}
        />
      )}
    </div>
  )
}

export default App
