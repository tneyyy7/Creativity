import { useState, useRef, useEffect } from 'react'
import { User, Camera, Loader2, Save, Mail, AtSign, CheckCircle2, BadgeCheck, Palette, Shapes, Users, Image, Calendar, Gem, Box, PenTool, Share } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, upsertProfile, uploadAvatar, fetchFollowCounts } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { FollowListModal } from '../components/FollowListModal'
import { getNicknameStyle, sanitizeNickname, isValidNickname, NICKNAME_MAX_LENGTH } from '../lib/nicknameStyle'
import { requestNotificationPermission, subscribeToPush, unsubscribeFromPush, checkNotificationSupport, testPushNotification, isPushSubscribed } from '../lib/pwa'

export function Profile({ user, nickname, setNickname, avatarUrl, setAvatarUrl, isVerified, specialization, setSpecialization, workCount, isPro, avatarFrame, nicknameColor, onViewProfile }) {
  const { t } = useTranslation()
  const fileInputRef = useRef(null)
  
  const [formNickname, setFormNickname] = useState(nickname)
  const [bio, setBio] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')
  const [joinedDate, setJoinedDate] = useState('')
  const [friendCount, setFriendCount] = useState(0)
  const [localWorkCount, setLocalWorkCount] = useState(workCount)
  const [notificationsSupported, setNotificationsSupported] = useState(false)
  const [notificationSupport, setNotificationSupport] = useState({ supported: false, reason: '' })
  const [notificationsGranted, setNotificationsGranted] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 })
  const [followModalTab, setFollowModalTab] = useState(null) // 'followers' | 'following' | null

  // The nickname prop arrives asynchronously (App fetches the profile after auth),
  // so it can still be the 'Artist User' default when this lazy route first mounts.
  // useState(nickname) only captures that initial value, which left the edit field
  // showing the default while the profile card showed the real nickname. Keep the
  // form in sync whenever the resolved nickname comes in (or changes after a save).
  useEffect(() => {
    setFormNickname(nickname)
  }, [nickname])

  useEffect(() => {
    // Fetch bio when component mounts
    const fetchProfileData = async () => {
      if (user) {
        // Fetch profile
        const { data } = await supabase.from('profiles').select('bio, specialization, created_at').eq('id', user.id).single()
        if (data) {
          if (data.bio) setBio(data.bio)
          if (data.specialization) setSpecialization(data.specialization)
          const rawDate = data.created_at || user.created_at
          if (rawDate) {
            const date = new Date(rawDate)
            setJoinedDate(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date))
          }
        } else if (user.created_at) {
          const date = new Date(user.created_at)
          setJoinedDate(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date))
        }

        // Fetch friend count
        const { count: fCount } = await supabase
          .from('friendships')
          .select('*', { count: 'exact', head: true })
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted')
        
        setFriendCount(fCount || 0)

        // Fetch actual work count (finished paintings)
        const { count: wCount } = await supabase
          .from('paintings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_finished', true)
        
        setLocalWorkCount(wCount || 0)

        // Fetch follow counts
        try {
          const counts = await fetchFollowCounts(user.id)
          setFollowCounts(counts)
        } catch (e) {
          console.error("Error loading follow counts:", e)
        }
      }
    }
    fetchProfileData()
    
    const support = checkNotificationSupport()
    setNotificationSupport(support)
    setNotificationsSupported(support.supported)
    setNotificationsGranted(isPushSubscribed())
  }, [user])

  const handleEnableNotifications = async () => {
    if (isSubscribing) return
    setIsSubscribing(true)
    setError('')
    try {
      const result = await subscribeToPush(user.id)
      if (result.success) {
        setNotificationsGranted(true)
      } else {
        setError(`${t('notifications_subscribe_error') || 'Failed to register device'}: ${result.error}`)
      }
    } catch (err) {
      console.error('Error in handleEnableNotifications:', err)
      setError(t('notifications_error') || 'An error occurred while enabling notifications')
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleDisableNotifications = async () => {
    if (isSubscribing) return
    if (!window.confirm(t('confirm_disable_push') || 'Вы уверены, что хотите отключить уведомления на этом устройстве?')) return
    
    setIsSubscribing(true)
    setError('')
    try {
      const success = await unsubscribeFromPush()
      if (success) {
        setNotificationsGranted(false)
      } else {
        setError(t('notifications_unsubscribe_error') || 'Failed to disable notifications. Please try again.')
      }
    } catch (err) {
      console.error('Error in handleDisableNotifications:', err)
      setError(t('notifications_error') || 'An error occurred while disabling notifications')
    } finally {
      setIsSubscribing(false)
    }
  }


  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError(t('invalid_image') || 'Please select a valid image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('image_too_large') || 'Image size must be less than 5MB.')
      return
    }

    setError('')
    setIsUploading(true)
    try {
      const publicUrl = await uploadAvatar(file, user.id)
      
      // Update profile with new avatar URL
      await upsertProfile({
        id: user.id,
        avatar_url: publicUrl,
        bio: bio,
        specialization: specialization,
        updated_at: new Date().toISOString()
      })
      
      setAvatarUrl(publicUrl)
      // setSpecialization(specialization) // Already in state, but ensuring consistency
      
    } catch (err) {
      console.error('Error uploading avatar:', err)
      setError(t('upload_error') || 'Failed to upload avatar.')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    setError('')
    setSaveSuccess(false)

    try {
      const trimmedNickname = formNickname.trim()

      if (!isValidNickname(trimmedNickname)) {
        setError(t('nickname_invalid') || 'Nickname can only contain English letters, digits and underscore (max 10 characters)')
        setIsSaving(false)
        return
      }

      // Check if nickname is already taken by another user
      if (trimmedNickname.toLowerCase() !== nickname.toLowerCase()) {
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('nickname', trimmedNickname)
          .neq('id', user.id)
          .maybeSingle()

        if (checkError) {
          console.error("Nickname check error:", checkError)
        }

        if (existingUser) {
          setError(t('nickname_taken') || 'This nickname is already taken.')
          setIsSaving(false)
          return
        }
      }

      await upsertProfile({
        id: user.id,
        nickname: trimmedNickname,
        avatar_url: avatarUrl,
        bio: bio.trim(),
        specialization: specialization,
        updated_at: new Date().toISOString()
      })
      
      setNickname(trimmedNickname)
      
      // Update auth metadata as a fallback
      await supabase.auth.updateUser({
        data: { nickname: trimmedNickname }
      })
      
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving profile:', err)
      setError(t('save_error') || 'Failed to save profile.')
    } finally {
      setIsSaving(false)
    }
  }

  const roleIcons = {
    painter: Palette,
    photographer: Camera,
    sculptor: Shapes,
    "3D": Box,
    designer: PenTool
  }
  const RoleIcon = roleIcons[specialization] || Palette

  return (
    <div className="max-w-6xl mx-auto space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-0">
      
      <div className="text-center md:text-left">
        <h1 className="text-lg md:text-xl font-black text-white tracking-tighter mb-0 flex items-center justify-center md:justify-start gap-2 leading-none">
          {t('profile_title') || 'Your Profile'}
          {isVerified && <BadgeCheck className="w-5 h-5 text-purple-400 fill-purple-400/20" />}
        </h1>
        <p className="text-gray-500 font-medium text-[11px] leading-tight">{t('profile_desc') || 'Manage your personal space and identity.'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Column: Public Presence & Stats */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-4">
          <div className="glass-card p-4 flex flex-col items-center text-center space-y-2 relative overflow-hidden group">
            {/* Background flourish */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl group-hover:bg-purple-600/20 transition-all duration-500"></div>
            
            <div 
              onClick={handleAvatarClick}
              className="group cursor-pointer relative"
            >
              <ProfileAvatar 
                avatarUrl={avatarUrl} 
                workCount={workCount} 
                size="xl" 
                isPro={isPro}
                avatarFrame={avatarFrame}
              >
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Camera className="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </ProfileAvatar>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <div>
              <h2 className="text-2xl font-black text-white notranslate flex items-center justify-center gap-2 animate-in fade-in duration-300" translate="no">
                <span style={getNicknameStyle(nicknameColor, '#fff')}>
                  {nickname}
                </span>
                {isVerified && <BadgeCheck className="w-5 h-5 text-purple-400 fill-purple-400/20 flex-shrink-0" />}
                {isPro && (
                  <span className="pro-badge pro-badge-lg">
                    <Gem className="pro-badge-icon" />
                    <span className="pro-badge-text">Pro</span>
                  </span>
                )}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-purple-500/20">
                  <RoleIcon className="w-3 h-3" />
                  {t(specialization)}
                </span>
                {isVerified && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-blue-500/20">
                     <CheckCircle2 className="w-3 h-3" />
                     {t('verified') || 'Verified'}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-2">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Image className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('works') || 'Works'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{localWorkCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('friends') || 'Friends'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{friendCount}</p>
              </div>
              <button
                type="button"
                onClick={() => setFollowModalTab('followers')}
                className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-0.5 hover:bg-white/10 transition-all"
              >
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Users className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('followers') || 'Followers'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{followCounts.followers}</p>
              </button>
              <button
                type="button"
                onClick={() => setFollowModalTab('following')}
                className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-0.5 hover:bg-white/10 transition-all"
              >
                <div className="flex items-center gap-1.5 text-gray-500">
                  <User className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('following') || 'Following'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{followCounts.following}</p>
              </button>
            </div>

            <div className="w-full pt-3 border-t border-white/5 flex items-center justify-center gap-2 text-gray-500 text-[9px] font-black uppercase tracking-widest">
              <Calendar className="w-3 h-3" />
              {t('joined') || 'Joined'} {joinedDate || '—'}
            </div>
          </div>
        </div>

        {/* Right Column: Settings Form */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div className="glass-card p-4 md:p-5">
            <h3 className="text-sm font-black text-white tracking-tight mb-3 flex items-center gap-2">
              <Save className="w-4 h-4 text-purple-500" />
              {t('edit_profile')}
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Email (Readonly) */}
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('email')}</label>
                   <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                      <input 
                       readOnly
                       value={user?.email || ''}
                       autoComplete="off"
                       className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/5 rounded-2xl text-gray-400 cursor-not-allowed opacity-70"
                      />
                   </div>
                </div>

                {/* Nickname */}
                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('nickname')}</label>
                   <div className="relative">
                      <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                       required
                       value={formNickname}
                       onChange={(e) => setFormNickname(sanitizeNickname(e.target.value))}
                       placeholder="MasterArtist"
                       maxLength={NICKNAME_MAX_LENGTH}
                       autoComplete="off"
                       className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-white text-sm font-medium"
                      />
                   </div>
                </div>
              </div>

              {/* Specialization Selection */}
              <div className="space-y-3 pt-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('specialization')}</label>
                <div className="grid grid-cols-3 gap-2">
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
                      className={`lg-pill flex flex-col items-center gap-1.5 p-3 rounded-2xl ${
                        specialization === item.id ? 'lg-pill--active' : ''
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${specialization === item.id ? 'animate-pulse' : ''}`} />
                      <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Push Notifications Toggle */}
              <div className="space-y-3 pt-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">
                  {t('notifications') || 'Push Notifications'}
                </label>

                {notificationsSupported ? (
                  <button
                    type="button"
                    onClick={notificationsGranted ? handleDisableNotifications : handleEnableNotifications}
                    disabled={isSubscribing}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      notificationsGranted
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                    } ${isSubscribing ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notificationsGranted ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-500'}`}>
                        {isSubscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : <BadgeCheck className="w-5 h-5" />}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black uppercase tracking-tight">
                          {notificationsGranted ? (t('notifications_enabled') || 'Уведомления активны') : (t('enable_notifications') || 'Включить уведомления')}
                        </p>
                        <p className="text-[9px] font-medium opacity-60">
                          {notificationsGranted ? (t('notifications_desc_active') || 'Ваш телефон будет получать оповещения') : (t('notifications_desc_inactive') || 'Получайте уведомления о сообщениях и активности')}
                        </p>
                      </div>
                    </div>
                    {!isSubscribing && (
                      <div className={`px-3 py-1 rounded-lg text-white text-[9px] font-black uppercase tracking-widest ${notificationsGranted ? 'bg-white/10 hover:bg-red-500/20 text-gray-400' : 'bg-purple-600'}`}>
                        {notificationsGranted ? (t('disable') || 'Отключить') : (t('activate') || 'Активировать')}
                      </div>
                    )}
                  </button>
                ) : notificationSupport.reason === 'ios_not_standalone' ? (
                  <div className="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10 text-purple-400 flex-shrink-0">
                        <Share className="w-5 h-5" />
                      </div>
                      <div className="text-left space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight text-purple-400">
                          {t('notifications_unsupported') || 'Уведомления не поддерживаются'}
                        </p>
                        <p className="text-[10px] font-medium text-gray-400 leading-normal">
                          {t('ios_pwa_instruction') || 'Чтобы включить уведомления на iOS, нажмите кнопку «Поделиться» и выберите «На экран "Домой"», после чего запустите приложение с экрана.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-gray-500 flex-shrink-0">
                      <BadgeCheck className="w-5 h-5 opacity-40" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-tight text-gray-500">
                        {t('notifications_unsupported') || 'Уведомления не поддерживаются'}
                      </p>
                      <p className="text-[9px] font-medium text-gray-600 leading-normal">
                        {t('notifications_unsupported_desc') || 'Ваш браузер или устройство не поддерживает push-уведомления.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bio */}
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('bio') || 'Bio'}</label>
                 <div className="relative">
                   <textarea 
                     value={bio}
                     onChange={(e) => setBio(e.target.value)}
                     placeholder={t('bio_placeholder') || 'Tell the world about your art...'}
                     translate="no"
                     className="notranslate w-full h-16 p-3 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-white text-xs resize-none custom-scrollbar leading-relaxed"
                   />
                 </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl animate-in shake duration-500">
                  <p className="text-sm font-bold text-red-500 text-center uppercase tracking-tighter">{error}</p>
                </div>
              )}

              {/* Save Button */}
              <button 
                disabled={isSaving || isUploading}
                type="submit"
                className={`w-full py-4 font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl ${
                  saveSuccess 
                    ? 'bg-green-500 text-white shadow-green-900/40'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40 hover:shadow-purple-900/60'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSaving ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-6 h-6" />
                    {t('saved') || 'Profile Updated'}
                  </>
                ) : (
                  <>
                    <Save className="w-6 h-6" />
                    {t('save_profile') || 'Save Changes'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

      </div>

      {followModalTab && (
        <FollowListModal
          userId={user?.id}
          initialTab={followModalTab}
          onClose={() => setFollowModalTab(null)}
          onViewProfile={onViewProfile}
        />
      )}
    </div>
  )
}
