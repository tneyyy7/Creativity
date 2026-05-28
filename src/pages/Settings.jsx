import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Save, Lock, Unlock, Key, Check, Loader2, AlertTriangle } from 'lucide-react'
import { supabase, fetchProfile, upsertProfile } from '../lib/supabase'

export function Settings({ userEmail }) {
  const { t } = useTranslation()
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)

  // Toast state
  const [toast, setToast] = useState(null)

  // Password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        fetchProfile(user.id).then((profile) => {
          if (profile) setIsPrivate(profile.is_private || false)
          setLoading(false)
        })
      }
    })
  }, [])

  const handleSave = async () => {
    try {
      if (userId) await upsertProfile({ id: userId, is_private: isPrivate })
      showToast('success', t('save_success') || 'Изменения сохранены!')
    } catch (error) {
      console.error('Error saving profile:', error)
      showToast('error', 'Ошибка: ' + error.message)
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showToast('error', 'Пароль должен содержать минимум 6 символов')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('error', 'Пароли не совпадают')
      return
    }
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      showToast('success', 'Пароль успешно изменён!')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      console.error('Password change error:', err)
      showToast('error', err.message || 'Ошибка при смене пароля')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-500">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-right-5 duration-300 border ${
          toast.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            : 'bg-red-500/20 border-red-500/40 text-red-300'
        }`}>
          {toast.type === 'success'
            ? <Check className="w-4 h-4 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          <span className="text-sm font-bold">{toast.msg}</span>
        </div>
      )}

      <div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 md:mb-3">{t('settings')}</h1>
      </div>

      <div className="space-y-6 md:space-y-8">

        {/* Account Section */}
        <div className="glass-card p-6 md:p-10 space-y-6 md:space-y-8 border-white/5">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">{t('account')}</h2>

          <div className="space-y-3">
            <label className="text-[10px] md:text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('email')}</label>
            <input
              disabled
              type="text"
              value={userEmail || ''}
              className="w-full h-12 md:h-14 px-6 bg-white/[0.01] border border-white/5 rounded-2xl text-gray-500 font-medium cursor-not-allowed text-sm md:text-base"
            />
          </div>

          {!loading && (
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
                <span className={`inline-block h-5 w-5 md:h-6 md:w-6 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6 md:translate-x-7' : 'translate-x-1'}`} />
              </button>
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

        {/* Password Change */}
        <div className="glass-card p-6 md:p-10 space-y-6 border-white/5">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Key className="w-4 h-4" />
            {t('change_password')}
          </h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">{t('new_password')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="w-full h-12 md:h-14 px-6 bg-white/[0.03] border border-white/5 rounded-2xl text-white font-medium focus:outline-none focus:border-purple-500/50 transition-all text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1">{t('confirm_password')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
                className="w-full h-12 md:h-14 px-6 bg-white/[0.03] border border-white/5 rounded-2xl text-white font-medium focus:outline-none focus:border-purple-500/50 transition-all text-sm"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword}
              className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-40 text-sm"
            >
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              {changingPassword ? t('saving') : t('change_password')}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
