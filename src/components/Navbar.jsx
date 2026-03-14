import { Search, Languages, User, Moon, Sun, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

export function Navbar({ nickname, avatarUrl, onToggleSidebar, onProfileClick }) {
  const { t, i18n } = useTranslation()
  const [showLangs, setShowLangs] = useState(false)

  const toggleLanguage = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('app_lang', code)
    setShowLangs(false)
  }

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
          <div className="text-right hidden sm:block">
            <h4 className="text-[14px] md:text-[15px] font-black text-white leading-tight">{nickname}</h4>
          </div>
          <button 
            onClick={onProfileClick}
            className="group relative p-[2px] rounded-xl md:rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-400 hover:from-purple-500 hover:to-indigo-300 transition-all cursor-pointer shadow-lg shadow-purple-900/40 hover:shadow-purple-700/60"
          >
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-[10px] md:rounded-[14px] bg-[#0c0b11] flex items-center justify-center overflow-hidden relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              ) : (
                <User className="text-purple-500 w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform duration-300" />
              )}
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}
