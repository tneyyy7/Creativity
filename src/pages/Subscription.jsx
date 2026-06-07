import { useState, useEffect } from 'react'
import { Check, Crown, Zap, Gem, AlertCircle, ArrowRight, Palette, Shield, Image as ImageIcon, Upload, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, fetchSubscriptionStatus, fetchProProfileSettings, updateProProfileSettings, uploadProfileCover } from '../lib/supabase'
import { redirectToStripeCheckout } from '../lib/stripe'
import { CustomEmojisManager } from '../components/CustomEmojisManager'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { getNicknameStyle } from '../lib/nicknameStyle'

// Stripe price IDs configuration
// The user will replace these placeholders with real Price IDs from their Stripe Dashboard
const STRIPE_PRICE_IDS = {
  monthly: 'price_1TckLM7eQhc0nsIxcmjsFEWD',
  yearly: 'price_1TckMl7eQhc0nsIxqGPu9TUz'
}

const PRESETS = {
  frames: [
    { id: 'default', name: 'Стандартная', class: '' },
    { id: 'gold', name: 'Золотое Сияние 🟡', class: 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)] animate-pulse' },
    { id: 'diamond', name: 'Бриллиантовый Блеск 💎', class: 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]' },
    { id: 'fire', name: 'Яростное Пламя 🔥', class: 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse' },
    { id: 'rainbow', name: 'Радужный Спектр 🌈', class: 'border-gradient-to-r from-red-500 via-green-500 to-blue-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]' },
    { id: 'ice', name: 'Вечный Лед ❄️', class: 'border-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.5)]' }
  ],
  colors: [
    { id: 'default', name: 'Стандартный', value: '' },
    { id: 'royal_purple', name: 'Королевский Пурпурный 💜', value: 'linear-gradient(135deg, #7C3AED, #EC4899, #60A5FA)' },
    { id: 'blazing_orange', name: 'Пылающий Оранжевый 🔥', value: 'linear-gradient(135deg, #FF9F43, #FF5252, #FFC048)' },
    { id: 'emerald_neon', name: 'Изумрудный Неон 💚', value: 'linear-gradient(90deg, #10B981, #06B6D4)' },
    { id: 'sky_azure', name: 'Небесный Лазурный 💙', value: 'linear-gradient(90deg, #06B6D4, #8B5CF6)' },
    { id: 'bloody_rose', name: 'Кровавая Роза 🌹', value: 'linear-gradient(135deg, #9E1B32, #F43F5E, #4A0E17)' },
    { id: 'gold_sand', name: 'Золотой Песок ✨', value: 'linear-gradient(135deg, #FFE066, #F59E0B, #FFF3BF)' },
    { id: 'arctic_aurora', name: 'Полярное Сияние 🌌', value: 'linear-gradient(90deg, #22D3EE, #A855F7, #EC4899)' },
    { id: 'sunset_fire', name: 'Закатный Огонь 🌅', value: 'linear-gradient(90deg, #F43F5E, #F59E0B, #10B981)' },
    { id: 'ice_crystal', name: 'Ледяной Кристалл ❄️', value: 'linear-gradient(90deg, #67E8F9, #A5F3FC, #E0F2FE)' }
  ],
  chatThemes: [
    { id: 'default', name: 'Классическая' },
    { id: 'dark_space', name: 'Глубокий Космос 🌌' },
    { id: 'cyberpunk', name: 'Киберпанк 2077 ⚡' },
    { id: 'rose_gold', name: 'Розовое Золото 🌸' },
    { id: 'sunset_glow', name: 'Закатное Сияние 🌅' }
  ]
}

function renderColorName(translatedName, colorValue) {
  if (!translatedName) return '';
  
  // Regex to match an emoji or symbol at the very end of the string, optional spaces
  const emojiRegex = /(.*?)\s*([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF])$/;
  const match = translatedName.match(emojiRegex);
  
  if (match) {
    const text = match[1];
    const emoji = match[2];
    return (
      <span className="inline-flex items-center gap-1">
        <span style={getNicknameStyle(colorValue, '#fff')}>{text}</span>
        <span className="text-xs shrink-0 notranslate" translate="no" style={{ WebkitTextFillColor: 'initial', color: '#fff' }}>{emoji}</span>
      </span>
    );
  }
  
  return <span style={getNicknameStyle(colorValue, '#fff')}>{translatedName}</span>;
}

export function Subscription() {
  const { t, i18n } = useTranslation()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [subStatus, setSubStatus] = useState({ plan: 'free', status: 'inactive', isPro: false })
  const [profileSettings, setProfileSettings] = useState({
    avatar_frame: 'default',
    nickname_color: '',
    chat_theme: 'default',
    cover_url: ''
  })
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) return
        setUser(currentUser)

        // Fetch user profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('nickname, avatar_url, finished_work_count')
          .eq('id', currentUser.id)
          .single()
        if (profileData) setProfile(profileData)

        // Fetch subscription status
        const sub = await fetchSubscriptionStatus(currentUser.id)
        setSubStatus(sub)

        // If active Pro, fetch profile settings
        if (sub.isPro) {
          const settings = await fetchProProfileSettings(currentUser.id)
          if (settings) {
            setProfileSettings({
              avatar_frame: settings.avatar_frame || 'default',
              nickname_color: settings.nickname_color || '',
              chat_theme: settings.chat_theme || 'default',
              cover_url: settings.cover_url || ''
            })
          }
        }
      } catch (err) {
        console.error('Error initializing subscription page:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleCheckout = async (planKey) => {
    if (!user) {
      setMessage({ type: 'error', text: t('pro_auth_error', 'Пожалуйста, авторизуйтесь для оформления подписки.') })
      return
    }

    try {
      setCheckoutLoading(planKey)
      setMessage({ type: '', text: '' })
      
      const priceId = STRIPE_PRICE_IDS[planKey]
      await redirectToStripeCheckout(priceId, user.id)
    } catch (err) {
      console.error('Error starting checkout:', err)
      setMessage({ type: 'error', text: t('pro_checkout_error', 'Не удалось запустить платежную форму. Попробуйте еще раз.') })
    } finally {
      setCheckoutLoading(null)
    }
  }

  // Center-crop an image file to 4:1 (1600x400), re-encode as WebP, and upload.
  const COVER_W = 1600
  const COVER_H = 400
  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !user || !subStatus.isPro) return

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: t('pro_cover_too_large', 'Файл слишком большой. Максимум 5 МБ.') })
      return
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setMessage({ type: 'error', text: t('pro_cover_bad_type', 'Поддерживаются только JPG, PNG или WebP.') })
      return
    }

    try {
      setCoverUploading(true)
      setMessage({ type: '', text: '' })

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const blob = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = COVER_W
            canvas.height = COVER_H
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('canvas context')); return }
            // Center-crop the source to a 4:1 region, then scale to 1600x400.
            const targetRatio = COVER_W / COVER_H
            const srcRatio = img.width / img.height
            let sx, sy, sw, sh
            if (srcRatio > targetRatio) {
              // source is wider — crop sides
              sh = img.height
              sw = sh * targetRatio
              sx = (img.width - sw) / 2
              sy = 0
            } else {
              // source is taller — crop top/bottom
              sw = img.width
              sh = sw / targetRatio
              sx = 0
              sy = (img.height - sh) / 2
            }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H)
            canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', 0.85)
          } catch (err) {
            reject(err)
          }
        }
        img.onerror = reject
        img.src = dataUrl
      })

      const coverFile = new File([blob], 'cover.webp', { type: 'image/webp' })
      const publicUrl = await uploadProfileCover(user.id, coverFile)
      setProfileSettings((prev) => ({ ...prev, cover_url: publicUrl }))
      setMessage({ type: 'success', text: t('pro_cover_uploaded', 'Обложка загружена. Не забудьте сохранить настройки.') })
    } catch (err) {
      console.error('Error uploading cover:', err)
      setMessage({ type: 'error', text: t('pro_cover_error', 'Не удалось загрузить обложку.') })
    } finally {
      setCoverUploading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!user || !subStatus.isPro) return
    
    try {
      setSavingSettings(true)
      setMessage({ type: '', text: '' })
      await updateProProfileSettings(user.id, profileSettings)
      setMessage({ type: 'success', text: t('pro_save_success', 'Премиум-настройки успешно сохранены!') })
      // Delay for a second to show the success message, then reload to apply globally
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error('Error saving profile settings:', err)
      setMessage({ type: 'error', text: t('pro_save_error', 'Ошибка при сохранении настроек.') })
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-8 md:space-y-12 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="text-center md:text-left">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter mb-2 flex items-center justify-center md:justify-start gap-3">
          {t('pro_title', 'Creativity Pro')} <Gem className="w-8 h-8 text-cyan-400 animate-bounce" />
        </h1>
        <p className="text-gray-400 text-sm sm:text-base md:text-lg font-medium">
          {t('pro_subtitle', 'Открой новые горизонты для творчества и вырази свою индивидуальность.')}
        </p>
      </div>

      {/* Message Banner */}
      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-semibold text-sm">{message.text}</span>
        </div>
      )}

      {/* Subscription Status Block for active Pro */}
      {subStatus.isPro ? (
        <div className="space-y-8">
          {/* Active status info */}
          <div data-lg-fx className="glass-card p-6 md:p-8 border-cyan-400/20 relative overflow-hidden bg-gradient-to-r from-purple-950/20 to-cyan-950/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10"></div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="bg-cyan-500/20 text-cyan-400 px-3 h-6 flex items-center text-[10px] uppercase font-black tracking-wider rounded-full border border-cyan-500/30">
                    {t('pro_active_badge', 'Активна')}
                  </span>
                  <span className="text-white text-sm font-black uppercase tracking-wider">
                    {subStatus.plan === 'pro_yearly' ? t('pro_pricing_yearly', 'Pro Yearly') : t('pro_pricing_monthly', 'Pro Monthly')}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white">{t('pro_congrats', 'Вы являетесь Premium-участником! 💎')}</h2>
                {subStatus.current_period_end && (
                  <p className="text-gray-400 text-sm">
                    {t('pro_renews_at', 'Подписка продлевается:')}{' '}
                    <span className="text-gray-200 font-bold">
                      {new Date(subStatus.current_period_end).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'ru-RU')}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <a
                  data-lg-fx
                  href="https://billing.stripe.com/p/login/3cI7sF5kP0lBcll3io4ko00" // Real Stripe customer portal
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white/5 hover:bg-white/10 text-white font-bold px-6 py-3 rounded-xl border border-white/10 transition-all text-sm block text-center no-underline hover:no-underline"
                >
                  {t('pro_manage_btn', 'Управление подпиской')}
                </a>
              </div>
            </div>
          </div>

          {/* Premium customization panel */}
          <div data-lg-fx className="glass-card p-6 md:p-8 border-white/5 space-y-8">
            <div className="border-b border-white/5 pb-4">
              <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <Palette className="w-6 h-6 text-purple-400" /> {t('pro_customization_title', 'Персонализация Premium-профиля')}
              </h2>
              <p className="text-gray-400 text-xs md:text-sm mt-1">
                {t('pro_customization_desc', 'Настройте эксклюзивные визуальные элементы, видимые всем пользователям платформы.')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar Frame Picker */}
              <div className="space-y-3">
                <label className="text-sm font-black text-white uppercase tracking-wider block">{t('pro_avatar_frame_label', 'Рамка для аватара')}</label>
                <select
                  value={profileSettings.avatar_frame}
                  onChange={(e) => setProfileSettings({ ...profileSettings, avatar_frame: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition-all"
                >
                  {PRESETS.frames.map((frame) => (
                    <option key={frame.id} value={frame.id} className="bg-neutral-900 text-white">
                      {t('frame_' + frame.id, frame.name)}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-center p-4 bg-white/5 rounded-xl border border-white/5 h-24">
                  <ProfileAvatar
                    avatarUrl={profile?.avatar_url}
                    workCount={profile?.finished_work_count ?? 0}
                    size="lg"
                    isPro={true}
                    avatarFrame={profileSettings.avatar_frame}
                  />
                </div>
              </div>

              {/* Nickname Color Picker */}
              <div className="space-y-3">
                <label className="text-sm font-black text-white uppercase tracking-wider block">{t('pro_nickname_color_label', 'Цвет никнейма')}</label>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.colors.map((color) => (
                      <button
                        key={color.id}
                        data-lg-fx
                        onClick={() => setProfileSettings({ ...profileSettings, nickname_color: color.value })}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                          profileSettings.nickname_color === color.value
                            ? 'border-purple-500 bg-purple-600/20 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                        }`}
                      >
                        {renderColorName(t('color_' + color.id, color.name), color.value)}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                    <span key={profileSettings.nickname_color || 'default'} className="text-lg font-black" style={getNicknameStyle(profileSettings.nickname_color, '#FFFFFF')}>
                      {profile?.nickname || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Cover (header background) */}
            <div className="space-y-3">
              <label className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-purple-400" /> {t('pro_cover_label', 'Обложка профиля')}
              </label>
              <p className="text-gray-400 text-xs">
                {t('pro_cover_hint', 'Рекомендуемый размер: 1600 × 400 px (4:1). JPG, PNG или WebP, до 5 МБ.')}
              </p>
              <div className="relative w-full aspect-[4/1] rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                {profileSettings.cover_url ? (
                  <>
                    <img src={profileSettings.cover_url} alt="Cover preview" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                    {t('pro_cover_empty', 'Обложка не задана')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className={`btn btn-secondary cursor-pointer ${coverUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4" />
                  {coverUploading ? t('pro_cover_uploading', 'Загрузка...') : t('pro_cover_upload_btn', 'Загрузить обложку')}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverChange} className="hidden" disabled={coverUploading} />
                </label>
                {profileSettings.cover_url && (
                  <button
                    type="button"
                    onClick={() => setProfileSettings((prev) => ({ ...prev, cover_url: '' }))}
                    className="px-3 py-2 bg-white/5 hover:bg-red-500/10 text-gray-400 hover:text-red-400 rounded-xl transition-all flex items-center gap-1.5 text-sm font-bold border border-white/10"
                  >
                    <Trash2 className="w-4 h-4" /> {t('pro_cover_remove_btn', 'Убрать')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="btn btn-primary"
              >
                {savingSettings ? t('pro_saving_text', 'Сохранение...') : t('pro_save_settings_btn', 'Сохранить настройки')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Tariffs and Checkout Grid for standard user */
        <div className="space-y-12">
          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Free Plan */}
            <div data-lg-fx className="glass-card p-6 md:p-8 border-white/5 flex flex-col justify-between relative opacity-80">
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{t('pro_free_th', 'Free')}</span>
                  <h3 className="text-2xl font-black text-white">Free</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">$0</span>
                  <span className="text-gray-500 text-sm">/ {t('always', 'всегда')}</span>
                </div>
                <p className="text-gray-400 text-sm font-medium">{t('pro_price_free_desc', 'Все базовые функции платформы для просмотра и публикации работ.')}</p>
                <div className="w-full border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_file_size', 'Размер файла')} {t('pro_comp_file_size_val_free', 'до 15 МБ')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_stories_duration', 'Stories')} {t('pro_comp_stories_duration_val_free', '24 часа')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_chat_themes', 'Тема чата')} (Standard)</span>
                  </li>
                </ul>
              </div>
              <button disabled className="w-full mt-8 bg-white/5 text-gray-400 font-bold py-3.5 rounded-xl border border-white/5 text-sm cursor-default">
                {t('pro_current_plan', 'Ваш текущий тариф')}
              </button>
            </div>

            {/* Pro Monthly */}
            <div data-lg-fx className="glass-card p-6 md:p-8 border-purple-500/20 shadow-[0_8px_30px_rgba(168,85,247,0.15)] flex flex-col justify-between relative overflow-hidden bg-gradient-to-b from-purple-950/10 to-transparent">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -z-10"></div>
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest block mb-1">{t('popular', 'Популярный')}</span>
                  <h3 className="text-2xl font-black text-white flex items-center gap-2">
                    Pro Monthly <Zap className="w-5 h-5 text-purple-400" />
                  </h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">$4.99</span>
                  <span className="text-gray-400 text-sm">/ {t('monthly', 'месяц')}</span>
                </div>
                <p className="text-gray-400 text-sm font-medium">{t('pro_price_monthly_desc', 'Эксклюзивный доступ к расширенным визуальным эффектам и инструментам.')}</p>
                <div className="w-full border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span className="font-semibold text-white">{t('pro_comp_emojis_val')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_visual_status_val')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_analytics_val')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_stories_duration', 'Stories')} {t('pro_comp_stories_duration_val_pro')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_file_size_val_pro')} + {t('pro_comp_watermark_val')}</span>
                  </li>
                </ul>
              </div>
              <button
                data-lg-fx
                onClick={() => handleCheckout('monthly')}
                disabled={checkoutLoading !== null}
                className="w-full mt-8 bg-purple-500 hover:bg-purple-400 disabled:bg-purple-500/40 text-white font-black py-3.5 rounded-xl transition-all text-sm shadow-[0_4px_20px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2"
              >
                {checkoutLoading === 'monthly' ? t('loading', 'Запуск...') : t('pro_activate_btn', 'Активировать Pro')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Pro Yearly */}
            <div data-lg-fx className="glass-card p-6 md:p-8 border-cyan-500/20 shadow-[0_8px_30px_rgba(34,211,238,0.15)] flex flex-col justify-between relative overflow-hidden bg-gradient-to-b from-cyan-950/10 to-transparent">
              <div className="absolute top-0 right-0 bg-cyan-500 text-neutral-900 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                {t('pro_yearly_benefit', 'Выгода 33%')}
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl -z-10"></div>
              <div className="space-y-6">
                <div>
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest block mb-1">{t('max_benefit', 'Максимальная выгода')}</span>
                  <h3 className="text-2xl font-black text-white flex items-center gap-2">
                    Pro Yearly <Crown className="w-5 h-5 text-cyan-400 animate-pulse" />
                  </h3>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">$39.99</span>
                    <span className="text-gray-400 text-sm">/ {t('yearly', 'год')}</span>
                  </div>
                  <span className="text-cyan-400 text-xs font-semibold mt-1">≈ $3.33 {t('per_month', 'в месяц')}</span>
                </div>
                <p className="text-gray-400 text-sm font-medium">{t('pro_price_yearly_desc', 'Полный комплект привилегий на целый год со значительной экономией.')}</p>
                <div className="w-full border-t border-white/5 my-6"></div>
                <ul className="space-y-3.5">
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span className="font-semibold text-white">{t('pro_comp_premium_val', 'Все привилегии Pro-тарифа на год')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_emojis_val')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_visual_status_val')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_file_size_val_pro')}</span>
                  </li>
                  <li className="flex items-start gap-2.5 text-sm text-gray-200">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{t('pro_comp_explore_support_val')}</span>
                  </li>
                </ul>
              </div>
              <button
                data-lg-fx
                onClick={() => handleCheckout('yearly')}
                disabled={checkoutLoading !== null}
                className="w-full mt-8 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/40 text-neutral-900 font-black py-3.5 rounded-xl transition-all text-sm shadow-[0_4px_20px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2"
              >
                {checkoutLoading === 'yearly' ? t('loading', 'Запуск...') : t('pro_activate_yearly_btn', 'Активировать Yearly Pro')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Detailed Features comparison */}
          <div data-lg-fx className="glass-card p-6 md:p-8 border-white/5 space-y-6">
            <h2 className="text-xl md:text-2xl font-black text-white text-center flex items-center justify-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" /> {t('pro_comparison_title', 'Подробное сравнение функций')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="text-xs uppercase font-black tracking-wider border-b border-white/10 text-white">
                  <tr>
                    <th className="py-4 px-4">{t('pro_feature_th', 'Функционал')}</th>
                    <th className="py-4 px-4 text-center">{t('pro_free_th', 'Free')}</th>
                    <th className="py-4 px-4 text-center text-cyan-400">{t('pro_premium_th', 'Creativity Pro')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_emojis')}</td>
                    <td className="py-4 px-4 text-center text-gray-600">{t('locked', 'Нет')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_emojis_val')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_file_size')}</td>
                    <td className="py-4 px-4 text-center">{t('pro_comp_file_size_val_free')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_file_size_val_pro')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_visual_status')}</td>
                    <td className="py-4 px-4 text-center text-gray-600">{t('locked', 'Нет')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_visual_status_val')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_stories_duration')}</td>
                    <td className="py-4 px-4 text-center">{t('pro_comp_stories_duration_val_free')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_stories_duration_val_pro')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_stories_placement')}</td>
                    <td className="py-4 px-4 text-center">{t('pro_comp_stories_placement_val_free')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_stories_placement_val_pro')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_watermark')}</td>
                    <td className="py-4 px-4 text-center text-gray-600">{t('locked', 'Нет')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_watermark_val')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_explore_support')}</td>
                    <td className="py-4 px-4 text-center">{t('pro_comp_stories_placement_val_free')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_explore_support_val')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_chat_themes')}</td>
                    <td className="py-4 px-4 text-center text-gray-600">{t('locked', 'Нет')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_chat_themes_val')}</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 font-bold text-white">{t('pro_comp_analytics')}</td>
                    <td className="py-4 px-4 text-center text-gray-600">{t('locked', 'Нет')}</td>
                    <td className="py-4 px-4 text-center text-gray-200 font-bold">{t('pro_comp_analytics_val')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Emojis Manager Section (Always visible, evaluates status internally) */}
      <CustomEmojisManager userId={user?.id} isPro={subStatus.isPro} />
    </div>
  )
}
