import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { User, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function Settings({ nickname, setNickname, userEmail }) {
  const { t, i18n } = useTranslation()
  const [nameInput, setNameInput] = useState(nickname)

  const handleSave = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { nickname: nameInput }
      })
      if (error) throw error
      setNickname(nameInput)
      alert(t('save_success') || 'Changes saved!')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Error: ' + error.message)
    }
  }

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('app_lang', lng)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('settings')}</h1>
      </div>

      <div className="space-y-6 md:space-y-8">
        <div className="glass-card p-6 md:p-10 space-y-6 md:space-y-8 border-white/5">
          <div className="space-y-3">
            <label className="text-[10px] md:text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('email')}</label>
            <div className="relative">
              <input
                disabled
                type="text"
                value={userEmail || ''}
                className="w-full h-12 md:h-14 px-6 bg-white/[0.01] border border-white/5 rounded-2xl text-gray-500 font-medium cursor-not-allowed text-sm md:text-base"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] md:text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('nickname')}</label>
            <div className="relative">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-500" />
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full h-12 md:h-14 pl-12 md:pl-14 pr-6 bg-white/[0.03] border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white font-medium text-sm md:text-base"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] md:text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('language')}</label>
            <div className="flex gap-4">
              <button 
                onClick={() => changeLanguage('en')}
                className={`flex-1 py-3 md:py-4 rounded-2xl border transition-all font-bold text-sm md:text-base ${i18n.language === 'en' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-500'}`}
              >
                English
              </button>
              <button 
                onClick={() => changeLanguage('ru')}
                className={`flex-1 py-3 md:py-4 rounded-2xl border transition-all font-bold text-sm md:text-base ${i18n.language === 'ru' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-500'}`}
              >
                Русский
              </button>
              <button 
                onClick={() => changeLanguage('it')}
                className={`flex-1 py-3 md:py-4 rounded-2xl border transition-all font-bold text-sm md:text-base ${i18n.language === 'it' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-500'}`}
              >
                Italiano
              </button>
            </div>
          </div>


          <button
            onClick={handleSave}
            className="w-full py-3.5 md:py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-purple-900/40 text-sm md:text-base"
          >
            <Save className="w-5 h-5" />
            {t('save_changes')}
          </button>
        </div>
      </div>
    </div>
  )
}
