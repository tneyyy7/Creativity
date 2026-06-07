import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { Navbar } from './components/Navbar'
import { supabase, fetchProfile, updateLastSeen, fetchSubscriptionStatus, upsertProfile, fetchAdminRole, fetchPaintingById, attachReferral } from './lib/supabase'
import { Auth } from './pages/Auth'
import { Onboarding } from './pages/Onboarding'
import { TagPage } from './pages/TagPage'
import { PostViewerModal } from './components/PostViewerModal'
import { initOneSignal } from './lib/pwa'
import { applyTheme, getStoredTheme } from './lib/theme'
import { identifyUser, resetUser } from './lib/observability'
import { captureReferral, getReferral, clearReferral } from './utils/referral'

// Захватываем реферальную атрибуцию (?ref=код + домен-источник) как можно
// раньше, до OAuth-редиректов — first-touch сохраняется в localStorage.
// arrivedViaReferral=true, если в этой загрузке был параметр ?ref= — тогда
// для разлогиненного гостя по умолчанию открываем регистрацию.
const arrivedViaReferral = captureReferral()

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
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))

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

  if (path.startsWith('post/')) {
    const postId = path.split('post/')[1] || null
    return { tab: 'explore', targetId: null, exploreCategory: 'All', postId }
  }

  if (path.startsWith('tag/')) {
    const tagName = decodeURIComponent(path.split('tag/')[1] || '')
    return { tab: 'explore', targetId: null, exploreCategory: 'All', tagName }
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminRole, setAdminRole] = useState(null)
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
  const [coverUrl, setCoverUrl] = useState('')
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
    // Гость, пришедший по реф-ссылке, должен сразу видеть регистрацию.
    return initial.authMode || (arrivedViaReferral ? 'signup' : 'login')
  })
  
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [activeTag, setActiveTag] = useState(null)

  // Deep-link target captured from the initial URL (/post/:id or /tag/:name) at
  // mount — before the URL-sync effect can rewrite the path — and resolved once
  // the user session is ready. Consumed exactly once.
  const [initialDeepLink] = useState(() => {
    const i = parseInitialUrl()
    return { postId: i.postId || null, tagName: i.tagName || null }
  })
  const deepLinkConsumedRef = useRef(false)

  // Monotonic index attached to each in-app history entry so "smart back"
  // can tell whether there is a previous page to return to.
  const navIndexRef = useRef(0)

  // Open a shared post / tag page once the session is ready.
  useEffect(() => {
    if (!user || deepLinkConsumedRef.current) return
    const { postId, tagName } = initialDeepLink
    if (!postId && !tagName) return
    deepLinkConsumedRef.current = true

    if (tagName) {
      setActiveTag(tagName)
      return
    }
    fetchPaintingById(postId).then(painting => {
      if (!painting) return
      setPostViewer({
        painting,
        paintings: [painting],
        index: 0,
        externalProfile: painting.profiles || null
      })
    })
  }, [user])

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
        identifyUser(currUser.id)

        // Привязываем реферал, если он был захвачен по ссылке (?ref=). Работает
        // независимо от способа создания профиля; перезаписи нет — заполняются
        // только пустые поля. Источник: localStorage или метаданные signup.
        const storedRef = getReferral()
        const meta0 = currUser.user_metadata
        const refCode0 = storedRef.code || meta0?.referral_code || null
        const refHost0 = storedRef.host || meta0?.referrer_host || null
        if (refCode0 || refHost0) {
          attachReferral({ code: refCode0, host: refHost0, ts: storedRef.ts }).then((ok) => {
            if (ok) clearReferral()
          })
        }

        fetchAdminRole(currUser.id).then(({ isAdmin, role }) => {
          setIsAdmin(isAdmin)
          setAdminRole(role)
        })
        const meta = currUser.user_metadata
        
        // Fetch full profile info to get avatar and other DB-specific fields
        fetchProfile(currUser.id)
          .then(async (data) => {
            if (data) {
              setNickname(data.nickname || meta?.full_name || currUser.email?.split('@')[0])
              setAvatarUrl(data.avatar_url)
              setIsVerified(data.is_verified || false)
              setSpecialization(data.specialization || 'painter')
              setWorkCount(data.finished_work_count || 0)
              setAvatarFrame(data.avatar_frame || 'default')
              setNicknameColor(data.nickname_color || '')
              setCoverUrl(data.cover_url || '')
              // Sync the saved theme from the profile across devices.
              if (data.theme) setTheme(applyTheme(data.theme))
              
              if (data.is_onboarding_completed === false) {
                setIsOnboarding(true)
              }
            } else {
              // Profile row does not exist yet (e.g. OAuth signup without DB trigger).
              // Let's create it automatically!
              try {
                const defaultNickname = meta?.full_name || currUser.email?.split('@')[0] || 'Artist'
                const defaultSpecialization = 'painter'
                // Реферальная атрибуция пишется отдельно через attachReferral()
                // выше — она надёжна независимо от способа создания профиля.
                const newProfile = await upsertProfile({
                  id: currUser.id,
                  nickname: defaultNickname,
                  avatar_url: meta?.avatar_url || null,
                  specialization: defaultSpecialization,
                  is_verified: false
                })
                if (newProfile) {
                  setNickname(newProfile.nickname)
                  setAvatarUrl(newProfile.avatar_url)
                  setSpecialization(newProfile.specialization || 'painter')
                  setIsOnboarding(true)
                }
              } catch (e) {
                console.error("Failed to auto-create profile for OAuth user:", e)
              }
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
        resetUser()
        setIsAdmin(false)
        setAdminRole(null)
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
    // Supabase delivers password-recovery (and OAuth) credentials in the URL —
    // in the hash for the implicit flow (#access_token=…&type=recovery) and as
    // ?code=… for PKCE. The auth client reads them asynchronously on startup
    // and only then strips them from the URL itself. If we rewrite the URL with
    // pushState before that happens we wipe the credentials, the recovery
    // session is never created, and the later updateUser() call fails with
    // "Auth session missing". Leave the URL untouched until they're consumed.
    if (typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const hasAuthCredentials =
        hashParams.has('access_token') ||
        hashParams.get('type') === 'recovery' ||
        new URLSearchParams(window.location.search).has('code')
      if (hasAuthCredentials) return
    }

    const pushPath = (path) => {
      if (window.location.pathname !== path) {
        navIndexRef.current += 1
        window.history.pushState({ navIndex: navIndexRef.current }, '', path)
      }
    }

    if (isResettingPassword) {
      pushPath('/reset-password')
      return
    }

    if (!user) {
      pushPath(authMode === 'forgot' ? '/forgot-password' : `/${authMode}`)
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

  if (isOnboarding) {
    return <Onboarding user={user} onComplete={() => setIsOnboarding(false)} />
  }

  if (activeTag) {
    return (
      <div className="app-container">
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
          onProfileClick={() => { setActiveTag(null); setActiveTab('profile'); }}
          onFriendsClick={() => { setActiveTag(null); setActiveTab('friends'); }}
        />
        <main className="main-content custom-scrollbar">
          <TagPage
            tagName={activeTag}
            currentUser={user}
            onOpenPost={(id, painting, filteredPaintings, index, profile) => {
              setPostViewer({
                painting,
                paintings: filteredPaintings || [painting],
                index: index ?? 0,
                externalProfile: profile,
              })
            }}
            onBack={() => setActiveTag(null)}
          />
        </main>
        {postViewer && (
          <PostViewerModal
            paintings={postViewer.paintings}
            initialIndex={postViewer.index}
            currentUserId={user?.id}
            authorProfile={postViewer.externalProfile || postViewer.painting?.user || postViewer.painting?.profiles || null}
            onClose={() => setPostViewer(null)}
            onViewProfile={(userId) => {
              setPostViewer(null)
              setActiveTag(null)
              setTargetUserId(userId)
              setActiveTab('public_profile')
            }}
            onTagClick={(tagName) => {
              setPostViewer(null)
              setActiveTag(tagName)
            }}
          />
        )}
      </div>
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
        isAdmin={isAdmin}
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
            coverUrl={coverUrl}
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
            onMessage={openMessageWithUser}
            onOpenPost={(id, painting, collection, index, profile) => setPostViewer({
              painting,
              paintings: collection || [painting],
              index: index ?? 0,
              externalProfile: profile
            })}
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
          />}
          {activeTab === 'subscription' && <Subscription />}
          {activeTab === 'admin' && isAdmin && <Admin
            adminRole={adminRole}
            onViewProfile={(id) => { setTargetUserId(id); setActiveTab('public_profile'); }}
            onOpenPost={(id, painting, collection, index) => setPostViewer({
              painting,
              paintings: collection || [painting],
              index: index ?? 0,
            })}
          />}
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
          onTagClick={(tagName) => {
            setPostViewer(null);
            setActiveTag(tagName);
          }}
        />
      )}
    </div>
  )
}

export default App
