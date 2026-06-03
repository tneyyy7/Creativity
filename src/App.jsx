import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { useNavigationGestures } from './hooks/useNavigationGestures'
import { Navbar } from './components/Navbar'
import { supabase, fetchProfile, updateLastSeen, fetchSubscriptionStatus } from './lib/supabase'
import { Auth } from './pages/Auth'
import { PostViewerModal } from './components/PostViewerModal'
import { initOneSignal } from './lib/pwa'
import { applyTheme, getStoredTheme } from './lib/theme'

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

const parseInitialUrl = () => {
  const path = window.location.pathname.replace(/^\//, '')
  if (path === 'reset-password') {
    return { tab: 'dashboard', targetId: null, exploreCategory: 'All', isResettingPassword: true, authMode: 'reset' }
  }
  if (path === 'login') {
    return { tab: 'dashboard', targetId: null, exploreCategory: 'All', authMode: 'login' }
  }
  if (path === 'signup') {
    return { tab: 'dashboard', targetId: null, exploreCategory: 'All', authMode: 'signup' }
  }
  if (path === 'forgot' || path === 'forgot-password') {
    return { tab: 'dashboard', targetId: null, exploreCategory: 'All', authMode: 'forgot' }
  }
  if (!path) {
    return { tab: localStorage.getItem('creativity_active_tab') || 'dashboard', targetId: localStorage.getItem('creativity_target_user_id') || null, exploreCategory: 'All' }
  }
  
  if (path.startsWith('profile/')) {
    const targetId = path.split('profile/')[1] || null
    return { tab: 'public_profile', targetId, exploreCategory: 'All' }
  }

  if (path.startsWith('explore/')) {
    const rawCat = path.split('explore/')[1] || 'All'
    // Capitalize first letter to match component categories
    const category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1).toLowerCase()
    const formattedCategory = category === '3d' ? '3D' : category
    return { tab: 'explore', targetId: null, exploreCategory: formattedCategory }
  }
  
  const validTabs = [
    'dashboard', 'explore', 'gallery', 'bookmarks', 'productivity', 
    'ranks', 'profile', 'friends', 'messages', 'subscription', 'settings'
  ]
  
  if (validTabs.includes(path)) {
    return { tab: path, targetId: null, exploreCategory: 'All' }
  }
  
  return { tab: 'dashboard', targetId: null, exploreCategory: 'All' }
}

function App() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    const initial = parseInitialUrl()
    return initial.tab
  })
  const [theme, setTheme] = useState(getStoredTheme)
  const [nickname, setNickname] = useState('Artist User')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [isVerified, setIsVerified] = useState(false)
  const [specialization, setSpecialization] = useState('painter')
  const [workCount, setWorkCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [targetUserId, setTargetUserId] = useState(() => {
    const initial = parseInitialUrl()
    return initial.targetId
  }) // Used for viewing public profiles
  const [exploreCategory, setExploreCategory] = useState(() => {
    const initial = parseInitialUrl()
    return initial.exploreCategory
  })
  const [postViewer, setPostViewer] = useState(null)
  const [isPro, setIsPro] = useState(false)
  const [avatarFrame, setAvatarFrame] = useState('default')
  const [nicknameColor, setNicknameColor] = useState('')
  const [initialMessageUser, setInitialMessageUser] = useState(null)
  const [isResettingPassword, setIsResettingPassword] = useState(() => {
    const initial = parseInitialUrl()
    if (initial.isResettingPassword) return true
    if (typeof window !== 'undefined') {
      if (window.location.hash && window.location.hash.includes('type=recovery')) {
        return true
      }
      if (window.location.search && window.location.search.includes('reset=true')) {
        return true
      }
    }
    return false
  })

  const [authMode, setAuthMode] = useState(() => {
    const initial = parseInitialUrl()
    return initial.authMode || 'login'
  })

  // Monotonic index attached to each in-app history entry so "smart back"
  // can tell whether there is a previous page to return to.
  const navIndexRef = useRef(0)

  useEffect(() => {
    // Detect password recovery mode on initial load
    const initial = parseInitialUrl()
    if (initial.isResettingPassword) {
      setIsResettingPassword(true)
    } else if (window.location.hash && window.location.hash.includes('type=recovery')) {
      setIsResettingPassword(true)
    } else if (window.location.search && window.location.search.includes('reset=true')) {
      setIsResettingPassword(true)
    }

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
              // Sync the saved theme from the profile across devices.
              if (data.theme) setTheme(applyTheme(data.theme))
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true)
      }
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
    applyTheme(theme)
  }, [theme])

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

  // Tag the initial history entry so smart-back can tell whether there is any
  // in-app history to return to (vs. a deep link opened from outside the app).
  useEffect(() => {
    const state = window.history.state
    if (state && typeof state.navIndex === 'number') {
      navIndexRef.current = state.navIndex
    } else {
      window.history.replaceState({ navIndex: 0 }, '')
      navIndexRef.current = 0
    }
  }, [])

  // Synchronize activeTab, targetUserId, and exploreCategory state changes to URL path
  useEffect(() => {
    const pushPath = (path) => {
      if (window.location.pathname !== path) {
        navIndexRef.current += 1
        window.history.pushState({ navIndex: navIndexRef.current }, '', path)
      }
    }

    if (!user) {
      pushPath(authMode === 'forgot' ? '/forgot-password' : `/${authMode}`)
      return
    }

    if (isResettingPassword) {
      pushPath('/reset-password')
      return
    }

    if (activeTab === 'public_profile' && targetUserId) {
      pushPath(`/profile/${targetUserId}`)
    } else if (activeTab === 'explore') {
      pushPath(exploreCategory && exploreCategory !== 'All' ? `/explore/${exploreCategory.toLowerCase()}` : '/explore')
    } else if (activeTab && activeTab !== 'public_profile') {
      pushPath(`/${activeTab}`)
    }
  }, [activeTab, targetUserId, exploreCategory, isResettingPassword, authMode, user])

  // Synchronize browser history navigation (back/forward) to state
  useEffect(() => {
    const handlePopState = () => {
      navIndexRef.current = window.history.state?.navIndex ?? 0
      const initial = parseInitialUrl()
      setActiveTab(initial.tab)
      setTargetUserId(initial.targetId)
      setExploreCategory(initial.exploreCategory)
      setIsResettingPassword(initial.isResettingPassword || false)
      if (initial.authMode) {
        setAuthMode(initial.authMode)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Smart back: return to the actual previous in-app page via browser history.
  // If there is no previous in-app entry (deep link), fall back to the home tab.
  const goBack = () => {
    if ((window.history.state?.navIndex ?? 0) > 0) {
      window.history.back()
    } else {
      setTargetUserId(null)
      setActiveTab('dashboard')
    }
  }

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

  // --- Phone edge-swipe "back" gesture --------------------------------------
  // Screens that have their own internal levels (e.g. an open chat inside
  // Messages) register a back handler here. A left-edge swipe runs, in order:
  //   1. close an open post viewer, 2. the registered screen-level back,
  //   3. browser history back, 4. otherwise open the burger menu.
  const screenBackRef = useRef(null)
  const registerScreenBack = useCallback((fn) => { screenBackRef.current = fn }, [])

  const handleGestureBack = useCallback(() => {
    if (postViewer) { setPostViewer(null); return }
    if (screenBackRef.current) { screenBackRef.current(); return }
    // A public profile is a nested view reached from another screen — step back
    // to wherever the user came from. On every other (top-level) tab there is
    // nothing deeper to close, so the gesture opens the burger menu.
    if (activeTab === 'public_profile') {
      if ((window.history.state?.navIndex ?? 0) > 0) {
        window.history.back()
      } else {
        setTargetUserId(null)
        setActiveTab('dashboard')
      }
      return
    }
    setIsSidebarOpen(true)
  }, [postViewer, activeTab])

  const closeSidebarGesture = useCallback(() => setIsSidebarOpen(false), [])

  // Swipe left on a normal page → step forward through in-app history (mirror
  // of the edge-swipe "back"). When the menu is open, the left swipe closes it
  // instead — that case is handled inside the gesture hook.
  const handleGestureForward = useCallback(() => {
    if (postViewer) return // let the viewer own horizontal swipes
    window.history.forward()
  }, [postViewer])

  useNavigationGestures({
    onBack: handleGestureBack,
    onForward: handleGestureForward,
    onCloseSidebar: closeSidebarGesture,
    isSidebarOpen,
  })

  if (loading) {
    return null
  }
  if (!user || isResettingPassword) {
    const currentAuthMode = isResettingPassword ? 'reset' : authMode
    return (
      <Auth 
        onAuth={setUser} 
        initialMode={currentAuthMode} 
        onModeChange={(newMode) => {
          setAuthMode(newMode)
          if (newMode === 'reset') {
            setIsResettingPassword(true)
          } else {
            setIsResettingPassword(false)
          }
        }}
        onPasswordResetComplete={() => setIsResettingPassword(false)} 
      />
    )
  }

  const closeSidebar = () => setIsSidebarOpen(false)

  const openMessageWithUser = (profile) => {
    if (profile) setInitialMessageUser(profile)
    setActiveTab('messages')
  }

  return (
    <div className="app-container">
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
              initialCategory={exploreCategory}
              onCategoryChange={setExploreCategory}
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
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
          />}
          {activeTab === 'friends' && <Friends
            user={user} 
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }} 
          />}
          { activeTab === 'public_profile' && <PublicProfile 
            currentUserId={user?.id}
            targetUserId={targetUserId}
            onBack={goBack}
            onMessage={openMessageWithUser}
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
            initialChatUser={initialMessageUser}
            onInitialChatOpened={() => setInitialMessageUser(null)}
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
            registerBack={registerScreenBack}
          />}
          {activeTab === 'subscription' && <Subscription />}
          {activeTab === 'settings' && <Settings userEmail={user?.email} currentTheme={theme} onThemeChange={setTheme} />}
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
