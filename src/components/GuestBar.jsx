import { Languages, LogIn, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect } from 'react'
import { setOneSignalLanguage } from '../lib/pwa'

/*
  Верхняя панель для гостя (неавторизованного посетителя). Вместо профиля и
  уведомлений — призывы войти / зарегистрироваться плюс переключатель языка.
*/
export function GuestBar({ onLogin, onSignup }) {
  const { t, i18n } = useTranslation()
  const [showLangs, setShowLangs] = useState(false)
  const langRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setShowLangs(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const toggleLanguage = (code) => {
    i18n.changeLanguage(code)
    localStorage.setItem('app_lang', code)
    setOneSignalLanguage(code)
    setShowLangs(false)
  }

  return (
    <header
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(var(--navbar-height, 5rem) + env(safe-area-inset-top))',
      }}
      className="[--navbar-height:5rem] md:[--navbar-height:6rem] px-4 md:px-10 flex items-center justify-between border-b border-white/[0.04] bg-[#0c0b11]/80 backdrop-blur-md sticky top-0 z-40"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 md:w-10 md:h-10 bg-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-900/40">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <span className="font-black text-white tracking-tighter text-lg hidden sm:block">Creativity</span>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="sm:relative" ref={langRef}>
          <button
            onClick={() => setShowLangs((v) => !v)}
            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-gray-400 hover:bg-white/5 hover:text-white rounded-2xl transition-all"
          >
            <Languages className="w-5 h-5" />
          </button>
          {showLangs && (
            <div className="absolute right-4 sm:right-0 mt-4 w-52 bg-[#0c0b11] border border-white/10 rounded-3xl z-50 py-3 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
              {['en', 'ru', 'it'].map((code) => (
                <button
                  key={code}
                  onClick={() => toggleLanguage(code)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-sm font-bold text-gray-400 hover:bg-white/[0.03] hover:text-purple-400 transition-all text-left group"
                >
                  <span className="text-xl grayscale group-hover:grayscale-0 transition-all">
                    {code === 'en' ? '🇺🇸' : code === 'ru' ? '🇷🇺' : '🇮🇹'}
                  </span>
                  <span className="tracking-tight">
                    {code === 'en' ? 'English' : code === 'ru' ? 'Русский' : 'Italiano'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onLogin}
          className="h-10 md:h-11 px-3 md:px-4 flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
        >
          <LogIn className="w-4 h-4" />
          <span className="hidden sm:inline">{t('auth_signin', 'Войти')}</span>
        </button>
        <button
          onClick={onSignup}
          className="h-10 md:h-11 px-4 md:px-5 flex items-center text-sm font-black uppercase tracking-wider text-white bg-purple-600 hover:bg-purple-500 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-purple-900/40"
        >
          {t('auth_signup', 'Регистрация')}
        </button>
      </div>
    </header>
  )
}
