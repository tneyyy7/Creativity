import { useState, useEffect } from 'react'
import { LayoutDashboard, Settings as SettingsIcon, Trophy, MessageSquare, Image, Palette, BarChart3, Settings, LogOut, X, Users, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchTotalUnreadCount } from '../lib/supabase'

export function Sidebar({ activeTab, setActiveTab, onLogout, isOpen, onClose, currentUser }) {
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
    { id: 'gallery', icon: Palette, label: t('gallery') },
    { id: 'friends', icon: Users, label: t('friends') },
    { id: 'messages', icon: MessageCircle, label: t('messages') || 'Messages' },
    { id: 'chat', icon: MessageSquare, label: t('chat') },
    { id: 'images', icon: Image, label: t('images') },
    { id: 'ranks', icon: Trophy, label: t('ranks') },
    { id: 'productivity', icon: BarChart3, label: t('productivity') },
  ]

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-[70]
        w-72 flex flex-col py-6 bg-[#0c0b11] lg:bg-transparent
        transition-transform duration-500 ease-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-8 mb-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/40">
              <Palette className="text-white w-7 h-7" />
            </div>
            <span className="text-2xl font-bold font-outfit text-white tracking-tight">Creativity</span>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em] px-4 mb-6">{t('menu')}</p>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                activeTab === item.id 
                  ? "bg-purple-600/10 text-purple-500 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? "text-purple-500" : "text-gray-500 group-hover:text-gray-300"}`} />
              <span className="font-semibold text-[15px]">{item.label}</span>
              {item.id === 'messages' && unreadCount > 0 && (
                <div className="ml-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-red-500/40 animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
              {activeTab === item.id && <div className="ml-auto w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(147,51,234,0.8)]"></div>}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-4 space-y-2">
           <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em] px-4 mb-4">{t('general')}</p>
           <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${activeTab === 'settings' ? 'bg-purple-600/10 text-purple-500 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.2)]' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
           >
            <SettingsIcon className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-[15px]">{t('settings')}</span>
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <LogOut className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-[15px]">{t('logout')}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
