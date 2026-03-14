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

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [theme, setTheme] = useState('dark')
  const [nickname, setNickname] = useState('Artist User')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const syncUser = (currUser) => {
      if (currUser) {
        setUser(currUser)
        const meta = currUser.user_metadata
        setNickname(meta?.nickname || meta?.full_name || currUser.email?.split('@')[0])
      } else {
        setUser(null)
        setNickname('Artist User')
      }
      setLoading(false)
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncUser(session?.user)
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

  if (loading) return null
  if (!user) return <Auth onAuth={setUser} />

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
          nickname={nickname} 
          userEmail={user?.email} 
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          {activeTab === 'dashboard' && <Dashboard nickname={nickname} />}
          {activeTab === 'chat' && <Chat />}
          {activeTab === 'images' && <ImageGen />}
          {activeTab === 'gallery' && <Gallery />}
          {activeTab === 'productivity' && <Productivity />}
          {activeTab === 'ranks' && <Ranks />}
          {activeTab === 'settings' && <Settings nickname={nickname} setNickname={setNickname} userEmail={user?.email} />}
        </main>
      </div>
    </div>
  )
}

export default App
