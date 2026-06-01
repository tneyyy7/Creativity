import { useState, useEffect } from 'react'
import { Mail, Lock, User, ArrowRight, Loader2, AlertCircle, Palette, Camera, Shapes, Box, PenTool, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sanitizeNickname, isValidNickname, NICKNAME_MAX_LENGTH } from '../lib/nicknameStyle'
import { useTranslation } from 'react-i18next'

export function Auth({ onAuth, initialMode = 'login', onPasswordResetComplete }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(initialMode) // 'login' | 'signup' | 'forgot' | 'reset'
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [nickname, setNickname] = useState('')
  const [specialization, setSpecialization] = useState('painter')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Sync mode state with prop updates (e.g. if PASSWORD_RECOVERY triggers 'reset')
  useEffect(() => {
    setMode(initialMode)
    setError('')
    setMessage('')
  }, [initialMode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error
        onAuth(data.user)
      } else if (mode === 'signup') {
        const trimmedNickname = nickname.trim()

        if (password !== confirmPassword) {
          throw new Error(t('password_mismatch') || "Passwords do not match")
        }

        if (!isValidNickname(trimmedNickname)) {
          throw new Error(t('nickname_invalid') || "Nickname can only contain English letters, digits and underscore (max 10 characters)")
        }

        // Check if nickname is already taken before signing up
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('nickname', trimmedNickname)
          .maybeSingle()

        if (checkError) {
          console.error("Nickname check error:", checkError)
        }

        if (existingUser) {
          throw new Error(t('nickname_taken') || "This nickname is already taken")
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nickname: trimmedNickname,
              full_name: trimmedNickname,
              specialization: specialization
            }
          }
        })
        if (error) throw error
        if (data.user) {
          if (data.session) {
            onAuth(data.user)
          } else {
            setMessage(t('auth_check_email') || "Please check your email to confirm your account, or tell admin to disable confirmation.")
          }
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/?reset=true`,
        })
        if (error) throw error
        setMessage(t('auth_check_email_reset') || "Инструкция по восстановлению пароля отправлена на ваш email.")
      } else if (mode === 'reset') {
        if (password !== confirmPassword) {
          throw new Error(t('password_mismatch') || "Passwords do not match")
        }
        if (password.length < 6) {
          throw new Error(t('password_min_error') || "Password must be at least 6 characters")
        }

        const { data, error } = await supabase.auth.updateUser({
          password: password
        })
        if (error) throw error

        setMessage(t('password_changed') || "Password changed successfully!")
        
        // Log in the user immediately since Supabase recovery session is active
        if (data?.user) {
          setTimeout(() => {
            if (onPasswordResetComplete) onPasswordResetComplete()
            onAuth(data.user)
          }, 1500)
        }
      }
    } catch (err) {
      console.error("Auth Error:", err)
      setError(err.message || "An error occurred during authentication")
    } finally {
      setIsLoading(false)
    }
  }

  const isSignup = mode === 'signup'
  const isReset = mode === 'reset'
  const isForgot = mode === 'forgot'
  const isLogin = mode === 'login'

  let pageTitle = t('auth_welcome')
  if (isSignup) pageTitle = t('auth_create')
  if (isForgot) pageTitle = t('auth_forgot_title') || "Восстановление"
  if (isReset) pageTitle = t('auth_reset_title') || "Новый пароль"

  let buttonText = t('auth_signin')
  if (isSignup) buttonText = t('auth_signup')
  if (isForgot) buttonText = t('auth_send_instructions') || "Отправить инструкции"
  if (isReset) buttonText = t('auth_save_password') || "Сохранить пароль"

  return (
    <div className="fixed inset-0 z-[100] h-screen h-[100dvh] bg-[#0c0b11] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
      <div
        className={`min-h-full flex justify-center px-4 sm:px-6 ${isSignup ? 'items-start' : 'items-center'}`}
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2.5rem, calc(env(safe-area-inset-bottom) + 2rem))',
        }}
      >
        <div className="w-full max-w-md min-h-0 space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-purple-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-2xl shadow-purple-900/40">
              <Lock className="text-white w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter mb-2">
              {pageTitle}
            </h1>
            <p className="text-gray-500 font-medium">{t('auth_ignite')}</p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-xs font-bold text-red-500 uppercase tracking-tight">{error}</p>
            </div>
          )}

          {message && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-tight">{message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="glass-card p-5 sm:p-8 md:p-10 space-y-5 sm:space-y-6">
            {isSignup && (
              <>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('nickname')}</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      required
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(sanitizeNickname(e.target.value))}
                      placeholder="MasterArtist"
                      maxLength={NICKNAME_MAX_LENGTH}
                      translate="no"
                      className="notranslate w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('choose_specialization')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'painter', icon: Palette, label: t('painter') },
                      { id: 'photographer', icon: Camera, label: t('photographer') },
                      { id: 'sculptor', icon: Shapes, label: t('sculptor') },
                      { id: '3D', icon: Box, label: t('3D') },
                      { id: 'designer', icon: PenTool, label: t('designer') }
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSpecialization(item.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                          specialization === item.id
                            ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                            : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/10 hover:text-gray-300'
                        }`}
                      >
                        <item.icon className={`w-6 h-6 ${specialization === item.id ? 'animate-pulse' : ''}`} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!isReset && (
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
            )}

            {!isForgot && (
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">
                  {isReset ? (t('new_password') || 'New Password') : t('password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-14 pl-12 pr-12 bg-white/5 border border-white/5 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500/30 transition-all text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    tabIndex={-1}
                    aria-label={showPassword ? (t('hide_password') || 'Hide password') : (t('show_password') || 'Show password')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {(isSignup || isReset) && (
              <div className="space-y-2">
                <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">
                  {isReset ? (t('confirm_password') || 'Confirm Password') : t('confirm_password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full h-14 pl-12 pr-12 bg-white/5 border rounded-2xl focus:outline-none focus:ring-4 transition-all text-white ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-red-500/40 focus:ring-red-500/10 focus:border-red-500/40'
                        : 'border-white/5 focus:ring-purple-500/10 focus:border-purple-500/30'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? (t('hide_password') || 'Hide password') : (t('show_password') || 'Show password')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[11px] font-bold text-red-500 pl-2">{t('password_mismatch') || 'Passwords do not match'}</p>
                )}
              </div>
            )}

            <button
              disabled={isLoading || ((isSignup || isReset) && password !== confirmPassword)}
              type="submit"
              className="w-full py-5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-purple-900/20 group"
            >
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  {buttonText}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {isLogin && (
            <div className="space-y-4 text-center font-bold text-sm">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 block mx-auto transition-colors"
              >
                {t('auth_forgot_password') || "Забыли пароль?"}
              </button>
              <p className="text-gray-500">
                {t('auth_no_account')}
                <button
                  onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                  className="text-purple-500 hover:text-purple-400 underline underline-offset-4 ml-2 transition-colors"
                >
                  {t('auth_signup')}
                </button>
              </p>
            </div>
          )}

          {isSignup && (
            <p className="text-center text-gray-500 font-bold text-sm">
              {t('auth_has_account')}
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 ml-2 transition-colors"
              >
                {t('auth_signin')}
              </button>
            </p>
          )}

          {(isForgot || isReset) && (
            <p className="text-center text-gray-500 font-bold text-sm">
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 transition-colors"
              >
                {t('auth_back_to_login') || "Вернуться к входу"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
