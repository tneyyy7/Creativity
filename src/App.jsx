import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/Navbar'
import { supabase, fetchProfile } from './lib/supabase'
import { Dashboard } from './pages/Dashboard'
import { Chat } from './pages/Chat'
import { ImageGen } from './pages/ImageGen'
import { Gallery } from './pages/Gallery'
import { Productivity } from './pages/Productivity'
import { Ranks } from './pages/Ranks'
import { Settings } from './pages/Settings'
import { Auth } from './pages/Auth'
import { PublicProfile } from './pages/PublicProfile'
import { Messages } from './pages/Messages'
import { PostViewerModal } from './components/PostViewerModal'
import { Profile } from './pages/Profile'
import { Friends } from './pages/Friends'
import { initOneSignal } from './lib/pwa'

function App() {
  console.log('App initialization started')
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [theme, setTheme] = useState('dark')
  const [nickname, setNickname] = useState('Artist User')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [isVerified, setIsVerified] = useState(false)
  const [workCount, setWorkCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [targetUserId, setTargetUserId] = useState(null) // Used for viewing public profiles
  const [postViewer, setPostViewer] = useState(null)

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
              setWorkCount(data.finished_work_count || 0)
            }
          })
      } else {
        setUser(null)
        setNickname('Artist User')
        setAvatarUrl(null)
        setIsVerified(false)
        setWorkCount(0)
      }
      setLoading(false)
    }

    // Get initial session
    console.log('Fetching initial session...')
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Session fetched:', session ? 'User logged in' : 'No user')
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
    }
  }, [user])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  // const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  console.log('App render. Loading:', loading, 'User:', !!user)

  if (loading) {
    console.log('Returning null (loading)')
    return null
  }
  if (!user) {
    console.log('Redirecting to Auth')
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
      />
      <div className="main-content">
        <Navbar 
          activeTab={activeTab}
          user={user}
          nickname={nickname}
          avatarUrl={avatarUrl}
          isVerified={isVerified}
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
        <main className={`flex-1 ${activeTab === 'messages' ? 'overflow-hidden' : 'overflow-y-auto'} p-4 md:p-10 custom-scrollbar flex flex-col`}>
          {activeTab === 'dashboard' && <Dashboard nickname={nickname} isVerified={isVerified} onNavigate={setActiveTab} />}
          {/* {activeTab === 'chat' && <Chat />} */}
          {/* {activeTab === 'images' && <ImageGen />} */}
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
          {activeTab === 'productivity' && <Productivity />}
          {activeTab === 'ranks' && <Ranks />}
          {activeTab === 'profile' && <Profile 
            user={user} 
            nickname={nickname} 
            setNickname={setNickname} 
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            isVerified={isVerified}
            workCount={workCount}
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
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
          />}
          {activeTab === 'settings' && <Settings userEmail={user?.email} />}
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
            finished_work_count: workCount
          } : (postViewer.externalProfile || postViewer.painting?.profiles || {
            id: user?.id,
            nickname: nickname,
            avatar_url: avatarUrl,
            finished_work_count: workCount
          })}
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
