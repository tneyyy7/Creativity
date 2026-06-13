import { useState, useEffect } from 'react'
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTranslation } from 'react-i18next'
import { LiquidGlassButton } from '../components/LiquidGlass'
import { getReferral } from '../utils/referral'

export function Auth({ onAuth, initialMode = 'login', onPasswordResetComplete, onModeChange, onBrowseAsGuest }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(initialMode) // 'login' | 'signup' | 'forgot' | 'reset'
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Sync mode state with prop updates (e.g. if PASSWORD_RECOVERY triggers 'reset')
  useEffect(() => {
    setMode(initialMode)
    setError('')
    setMessage('')
  }, [initialMode])

  const changeMode = (newMode) => {
    setMode(newMode)
    setError('')
    setMessage('')
    if (onModeChange) {
      onModeChange(newMode)
    }
  }

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError('')
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      console.error("Google Auth Error:", err)
      setError(err?.message || "An error occurred during Google authentication")
      setIsLoading(false)
    }
  }

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
        if (password !== confirmPassword) {
          throw new Error(t('password_mismatch') || "Passwords do not match")
        }

        // Дублируем реферальную атрибуцию в метаданные пользователя — это
        // подстраховка на случай подтверждения email в другом браузере, где
        // localStorage с first-touch недоступен (см. utils/referral.js).
        const ref = getReferral()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nickname: email.split('@')[0],
              full_name: email.split('@')[0],
              specialization: 'painter',
              ...(ref.code ? { referral_code: ref.code } : {}),
              ...(ref.host ? { referrer_host: ref.host } : {})
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

        // The recovery session is created from the link in the e-mail. When the
        // link is expired, was already used, or got opened in a browser that
        // never had the session, there is nothing to update and Supabase throws
        // a cryptic "Auth session missing!". Detect it up front and explain.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          throw new Error(
            t('auth_reset_link_invalid') ||
            "Ссылка для сброса пароля недействительна или истекла. Запросите новую."
          )
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
      const rawMessage = err?.message || "An error occurred during authentication"
      // Supabase surfaces a confusing "Auth session missing!" when a recovery
      // link is no longer valid — translate it into actionable guidance.
      const friendlyMessage = /auth session missing/i.test(rawMessage)
        ? (t('auth_reset_link_invalid') || "Ссылка для сброса пароля недействительна или истекла. Запросите новую.")
        : rawMessage
      setError(friendlyMessage)
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
        className="min-h-full flex flex-col items-center justify-start px-4 sm:px-6"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(2.5rem, calc(env(safe-area-inset-bottom) + 2rem))',
        }}
      >
        <div className="w-full max-w-md min-h-0 my-auto space-y-8 animate-in fade-in zoom-in duration-500">
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

            <LiquidGlassButton
              disabled={isLoading || ((isSignup || isReset) && password !== confirmPassword)}
              type="submit"
              fullWidth
              accent
              config={{ radius: 18, padY: '1.25rem' }}
              className="font-black group"
            >
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  {buttonText}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </LiquidGlassButton>

            {(isLogin || isSignup) && (
              <>
                <div className="flex items-center gap-4 my-2 select-none">
                  <div className="flex-1 h-[1px] bg-white/10" />
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{t('auth_or') || 'Или'}</span>
                  <div className="flex-1 h-[1px] bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full h-14 flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl transition-all duration-300 font-bold text-white tracking-wide active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110 duration-300" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3A11.945 11.945 0 0 0 12 0C7.27 0 3.14 2.76 1.15 6.81l4.116 2.955Z"
                    />
                    <path
                      fill="#4285F4"
                      d="M23.49 12.275c0-.825-.075-1.62-.21-2.385H12v4.515h6.444a5.518 5.518 0 0 1-2.394 3.615l3.708 2.88c2.168-2 3.732-4.94 3.732-8.625Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.266 14.235 1.15 17.19A11.956 11.956 0 0 0 12 24c3.24 0 5.97-1.075 7.96-2.925l-3.708-2.88a7.126 7.126 0 0 1-4.252 1.19c-3.692 0-6.81-2.495-7.925-5.85L1.15 17.19A11.956 11.956 0 0 0 12 24l.01-.02Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 4.909c-3.692 0-6.81 2.495-7.925 5.856l-4.116-2.955A11.956 11.956 0 0 1 12 0c3.24 0 5.97 1.075 7.96 2.925l-3.49 3.49A7.042 7.042 0 0 1 12 4.91Z"
                    />
                  </svg>
                  <span className="group-hover:text-purple-300 transition-colors">
                    {isSignup
                      ? (t('auth_google_signup') || 'Зарегистрироваться через Google')
                      : (t('auth_google_signin') || 'Войти через Google')}
                  </span>
                </button>
              </>
            )}
          </form>

          {isLogin && (
            <div className="space-y-4 text-center font-bold text-sm">
              <button
                type="button"
                onClick={() => changeMode('forgot')}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 block mx-auto transition-colors"
              >
                {t('auth_forgot_password') || "Забыли пароль?"}
              </button>
              <p className="text-gray-500">
                {t('auth_no_account')}
                <button
                  onClick={() => changeMode('signup')}
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
                onClick={() => changeMode('login')}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 ml-2 transition-colors"
              >
                {t('auth_signin')}
              </button>
            </p>
          )}

          {(isForgot || isReset) && (
            <p className="text-center text-gray-500 font-bold text-sm">
              <button
                onClick={() => changeMode('login')}
                className="text-purple-500 hover:text-purple-400 underline underline-offset-4 transition-colors"
              >
                {t('auth_back_to_login') || "Вернуться к входу"}
              </button>
            </p>
          )}

          {onBrowseAsGuest && (isLogin || isSignup) && (
            <p className="text-center font-bold text-sm pt-1">
              <button
                onClick={onBrowseAsGuest}
                className="text-gray-400 hover:text-white underline underline-offset-4 transition-colors"
              >
                {t('auth_browse_as_guest', 'Просто посмотреть сайт →')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
