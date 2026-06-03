import { useState, useEffect } from 'react'
import { LayoutDashboard, Settings as SettingsIcon, Trophy, MessageSquare, Image, Palette, BarChart3, Settings, LogOut, X, Users, MessageCircle, Bookmark, Compass, Sparkles, Gem } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchTotalUnreadCount } from '../lib/supabase'

export function Sidebar({ activeTab, setActiveTab, onLogout, isOpen, onClose, currentUser, isPro }) {
  const { t } = useTranslation()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!currentUser) return

    const loadUnreadCount = async () => {
      const count = await fetchTotalUnreadCount(currentUser.id)
      setUnreadCount(count)
    }

    loadUnreadCount()

    // Subscribe to new messages to update badge in real-time
    const channel = supabase
      .channel('global_unread_count')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT (new messages) and UPDATE (marking as read/deleted)
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUser.id}`
        },
        () => {
          loadUnreadCount()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser])

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { id: 'explore', icon: Compass, label: t('explore') || 'Explore' },
    { id: 'gallery', icon: Palette, label: t('gallery') },
    { id: 'bookmarks', icon: Bookmark, label: t('bookmarks') || 'Bookmarks' },
    { id: 'friends', icon: Users, label: t('friends') },
    { id: 'messages', icon: MessageCircle, label: t('messages') || 'Messages' },
    { id: 'ranks', icon: Trophy, label: t('ranks') },
    { id: 'subscription', icon: Gem, label: 'Creativity Pro', isProItem: true },
    { id: 'productivity', icon: BarChart3, label: t('productivity') },
  ]

  return (
    <>
      {/* Mobile backdrop: dark blur over the page behind the menu. Always mounted
          so it can fade both in and out via an opacity transition. The expensive
          backdrop-filter is applied ONLY while open — leaving it on while closed
          keeps a full-screen blur layer composited every frame and janks the
          whole app on phones. */}
      <div
        id="sidebar-backdrop"
        onClick={onClose}
        aria-hidden="true"
        className={`
          fixed inset-0 z-[60] lg:hidden bg-black/60
          transition-opacity duration-300 ease-out
          ${isOpen ? 'opacity-100 backdrop-blur-md' : 'opacity-0 pointer-events-none'}
        `}
      />

      <aside
        id="app-sidebar"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          willChange: 'transform',
        }}
        className={`
        fixed lg:relative inset-y-0 left-0 z-[70]
        w-72 flex flex-col bg-[#0c0b11] lg:bg-transparent
        transform-gpu transition-transform duration-300 ease-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-8 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/icon-512.png"
              alt="Creativity Logo"
              className="w-12 h-12 rounded-2xl object-cover shadow-lg shadow-purple-900/40"
            />
            <span className="text-2xl font-bold text-white tracking-tight">Creativity</span>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Single scroll area for menu + general so short screens (phones with the
            address bar showing) scroll everything together instead of the pinned
            "General" section colliding with the last menu item. */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col">
        <nav className="px-4 space-y-1">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em] px-4 mb-3">{t('menu')}</p>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-2xl transition-all duration-300 group ${
                activeTab === item.id 
                  ? "bg-purple-600/10 text-purple-500 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]" 
                  : item.isProItem && isPro
                    ? "text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/5"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className={`w-5 h-5 ${
                activeTab === item.id 
                  ? "text-purple-500" 
                  : item.isProItem
                    ? isPro ? "text-cyan-400 animate-pulse" : "text-amber-400 group-hover:text-amber-300"
                    : "text-gray-500 group-hover:text-gray-300"
              }`} />
              <span className="font-semibold text-[15px]">{item.label}</span>
              {item.isProItem && isPro && (
                <div className="ml-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Active
                </div>
              )}
              {item.id === 'messages' && unreadCount > 0 && (
                <div className="ml-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-red-500/40 animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
              {activeTab === item.id && <div className="ml-auto w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(147,51,234,0.8)]"></div>}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-4 pt-4 space-y-1">
           <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em] px-4 mb-2">{t('general')}</p>
           <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-4 px-4 py-2.5 rounded-2xl transition-all duration-300 group ${activeTab === 'settings' ? 'bg-purple-600/10 text-purple-500 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
           >
            <SettingsIcon className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-[15px]">{t('settings')}</span>
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-4 py-2.5 rounded-2xl text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <LogOut className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-[15px]">{t('logout')}</span>
          </button>
        </div>
        </div>
      </aside>
    </>
  )
}
