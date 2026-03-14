import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/Navbar'
import { supabase } from './lib/supabase'
import { Dashboard } from './pages/Dashboard'
import { Chat } from './pages/Chat'
import { ImageGen } from './pages/ImageGen'
import { Gallery } from './pages/Gallery'
import { Productivity } from './pages/Productivity'
import { Ranks } from './pages/Ranks'
import { Settings } from './pages/Settings'
import { Auth } from './pages/Auth'
import { Profile } from './pages/Profile'
import { Friends } from './pages/Friends'
import { PublicProfile } from './pages/PublicProfile'

function App() {
  console.log('App initialization started')
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [theme, setTheme] = useState('dark')
  const [nickname, setNickname] = useState('Artist User')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [isVerified, setIsVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [targetUserId, setTargetUserId] = useState(null) // Used for viewing public profiles

  useEffect(() => {
    const syncUser = (currUser) => {
      if (currUser) {
        setUser(currUser)
        const meta = currUser.user_metadata
        
        // Fetch full profile info to get avatar and other DB-specific fields
        supabase.from('profiles').select('*').eq('id', currUser.id).single()
          .then(({ data }) => {
            if (data) {
              setNickname(data.nickname || meta?.full_name || currUser.email?.split('@')[0])
              setAvatarUrl(data.avatar_url)
              setIsVerified(data.is_verified || false)
            }
          })
      } else {
        setUser(null)
        setNickname('Artist User')
        setAvatarUrl(null)
        setIsVerified(false)
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
      />
      <div className="main-content">
        <Navbar 
          user={user}
          nickname={nickname}
          avatarUrl={avatarUrl}
          isVerified={isVerified}
          userEmail={user?.email} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
          onProfileClick={() => setActiveTab('profile')}
          onFriendsClick={() => setActiveTab('friends')}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          {activeTab === 'dashboard' && <Dashboard nickname={nickname} isVerified={isVerified} />}
          {activeTab === 'chat' && <Chat />}
          {activeTab === 'images' && <ImageGen />}
          {activeTab === 'gallery' && <Gallery />}
          {activeTab === 'productivity' && <Productivity />}
          {activeTab === 'ranks' && <Ranks />}
          {activeTab === 'profile' && <Profile 
            user={user} 
            nickname={nickname} 
            setNickname={setNickname} 
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            isVerified={isVerified}
          />}
          {activeTab === 'friends' && <Friends 
            user={user} 
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }} 
          />}
          {activeTab === 'public_profile' && <PublicProfile 
            currentUserId={user?.id}
            targetUserId={targetUserId}
            onBack={() => setActiveTab('friends')}
          />}
          {activeTab === 'settings' && <Settings userEmail={user?.email} />}
        </main>
      </div>
    </div>
  )
}

export default App
