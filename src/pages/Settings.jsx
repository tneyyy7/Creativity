import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Save, Lock, Unlock } from 'lucide-react'
import { supabase, fetchProfile, upsertProfile } from '../lib/supabase'

export function Settings({ userEmail }) {
  const { t } = useTranslation()
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        fetchProfile(user.id).then((profile) => {
          if (profile) {
            setIsPrivate(profile.is_private || false)
          }
          setLoading(false)
        })
      }
    })
  }, [])

  const handleSave = async () => {
    try {
      if (userId) {
        await upsertProfile({ id: userId, is_private: isPrivate })
      }
      alert(t('save_success') || 'Changes saved!')
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Error: ' + error.message)
    }
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

          {!loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {isPrivate ? <Lock className="w-5 h-5 text-purple-500" /> : <Unlock className="w-5 h-5 text-gray-400" />}
                    {t('private_account')}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">{t('private_account_desc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`relative inline-flex h-7 w-12 md:h-8 md:w-14 items-center rounded-full transition-colors focus:outline-none ${isPrivate ? 'bg-purple-600' : 'bg-white/10'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 md:h-6 md:w-6 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6 md:translate-x-7' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
          )}


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
