import { useState } from 'react'
import { Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'

export function Auth({ onAuth }) {
  const { t } = useTranslation()
  const [isLogin, setIsLogin] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error
        onAuth(data.user)
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nickname: nickname.trim(),
              full_name: nickname.trim() // Add full_name just in case some providers/logic use it
            }
          }
        })
        if (error) throw error
        if (data.user) {
          if (data.session) {
            onAuth(data.user)
          } else {
            setError(t('auth_check_email') || "Please check your email to confirm your account, or tell admin to disable confirmation.")
          }
        }
      }
    } catch (err) {
      console.error("Auth Error:", err)
      setError(err.message || "An error occurred during authentication")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0c0b11] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="text-center">
          <div className="w-20 h-20 bg-purple-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-purple-900/40">
            <Lock className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
            {isLogin ? t('auth_welcome') : t('auth_create')}
          </h1>
          <p className="text-gray-500 font-medium">{t('auth_ignite')}</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-500 uppercase tracking-tight">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-card p-10 space-y-6">
          {!isLogin && (
            <div className="space-y-2">
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('nickname')}</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  required
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="MasterArtist"
                  className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('email')}</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="artist@example.com"
                className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('password')}</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white"
              />
            </div>
          </div>

          <button
            disabled={isLoading}
            type="submit"
            className="w-full py-5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-purple-900/20 group"
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
              <>
                {isLogin ? t('auth_signin') : t('auth_signup')}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-gray-500 font-bold text-sm">
          {isLogin ? t('auth_no_account') : t('auth_has_account')}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-purple-500 hover:text-purple-400 underline underline-offset-4 ml-2"
          >
            {isLogin ? t('auth_signup') : t('auth_signin')}
          </button>
        </p>
      </div>
    </div>
  )
}
