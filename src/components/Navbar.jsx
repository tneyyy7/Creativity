import { LogOut, Settings, Bell, Menu, BadgeCheck, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProfileAvatar } from './ProfileAvatar'
import { useState, useEffect } from 'react'
import { fetchPendingRequests } from '../lib/supabase'

export function Navbar({ nickname, avatarUrl, userEmail, user, onToggleSidebar, onProfileClick, onFriendsClick, isVerified, workCount }) {
  const { t, i18n } = useTranslation()
  const [showLangs, setShowLangs] = useState(false)

  const toggleLanguage = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('app_lang', code)
    setShowLangs(false)
  }

  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (user?.id) {
      fetchPendingRequests(user.id)
        .then(data => setPendingCount(data.length))
        .catch(console.error)
    }
  }, [user])

  return (
    <header className="h-20 md:h-24 px-4 md:px-10 flex items-center justify-between border-b border-white/[0.04] bg-[#0c0b11]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden md:block">
           <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{t('visionary_artist')}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-8">
        <div className="flex items-center gap-2">

          <button
            onClick={onFriendsClick}
            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-white rounded-2xl transition-all relative"
          >
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] border-2 border-[#0c0b11]"></span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowLangs(!showLangs)}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-white rounded-2xl transition-all"
            >
              <Languages className="w-5 h-5" />
            </button>

            {showLangs && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLangs(false)}></div>
                <div className="absolute right-0 mt-4 w-52 bg-[#0c0b11] border border-white/10 rounded-3xl z-50 py-3 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                  {['en', 'ru', 'it'].map((code) => (
                    <button
                      key={code}
                      onClick={() => toggleLanguage(code)}
                      className="w-full flex items-center gap-4 px-6 py-4 text-sm font-bold text-gray-400 hover:bg-white/[0.03] hover:text-purple-400 transition-all text-left group"
                    >
                      <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{code === 'en' ? '🇺🇸' : code === 'ru' ? '🇷🇺' : '🇮🇹'}</span>
                      <span className="tracking-tight">{code === 'en' ? 'English' : code === 'ru' ? 'Русский' : 'Italiano'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4 md:pl-8 md:border-l md:border-white/5">
          <div
            onClick={onProfileClick}
            className="flex items-center gap-3 pl-3 py-1.5 pr-1.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer group"
          >
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-xs font-black text-white notranslate flex items-center gap-1" translate="no">
                {nickname}
                {isVerified && <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20" />}
              </span>
              <span className="text-[10px] font-bold text-gray-500 truncate max-w-[120px]">{userEmail}</span>
            </div>

            <ProfileAvatar
              avatarUrl={avatarUrl}
              workCount={workCount}
              size="md"
            />
          </div>
        </div>
      </div>
    </header>
  )
}
