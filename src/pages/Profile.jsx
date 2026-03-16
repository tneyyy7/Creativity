import { useState, useRef, useEffect } from 'react'
import { User, Camera, Loader2, Save, Mail, AtSign, CheckCircle2, BadgeCheck, Palette, Shapes, Users, Image, Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, upsertProfile, uploadAvatar } from '../lib/supabase'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { requestNotificationPermission, checkNotificationSupport } from '../lib/pwa'

export function Profile({ user, nickname, setNickname, avatarUrl, setAvatarUrl, isVerified, workCount }) {
  const { t } = useTranslation()
  const fileInputRef = useRef(null)
  
  const [formNickname, setFormNickname] = useState(nickname)
  const [bio, setBio] = useState('')
  const [specialization, setSpecialization] = useState('painter')
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')
  const [joinedDate, setJoinedDate] = useState('')
  const [friendCount, setFriendCount] = useState(0)
  const [localWorkCount, setLocalWorkCount] = useState(workCount)
  const [notificationsSupported, setNotificationsSupported] = useState(false)
  const [notificationsGranted, setNotificationsGranted] = useState(false)

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
      }
    }
    fetchProfileData()
    
    checkNotificationSupport().then(supported => {
      setNotificationsSupported(supported)
      setNotificationsGranted(Notification.permission === 'granted')
    })
  }, [user])

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission()
    setNotificationsGranted(granted)
    if (granted) {
      // Logic for actually subscribing could go here
      console.log('Notifications enabled!')
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
      setAvatarUrl(publicUrl)
      
      // Update profile with new avatar URL
      await upsertProfile({
        id: user.id,
        nickname: formNickname,
        avatar_url: publicUrl,
        bio: bio,
        specialization: specialization,
        updated_at: new Date().toISOString()
      })
      
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
      await upsertProfile({
        id: user.id,
        nickname: formNickname.trim(),
        avatar_url: avatarUrl,
        bio: bio.trim(),
        specialization: specialization,
        updated_at: new Date().toISOString()
      })
      
      setNickname(formNickname.trim())
      
      // Update auth metadata as a fallback
      await supabase.auth.updateUser({
        data: { nickname: formNickname.trim() }
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
    sculptor: Shapes
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
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[2rem]">
                <Camera className="w-8 h-8 text-white drop-shadow-lg" />
              </div>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <div>
              <h2 className="text-2xl font-black text-white notranslate" translate="no">{nickname}</h2>
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
                  <Image className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('works') || 'Works'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{localWorkCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-0.5">
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{t('friends') || 'Friends'}</span>
                </div>
                <p className="text-lg font-black text-white leading-none">{friendCount}</p>
              </div>
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
                       onChange={(e) => setFormNickname(e.target.value)}
                       placeholder="MasterArtist"
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
                    { id: 'sculptor', icon: Shapes, label: t('sculptor') }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSpecialization(item.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                        specialization === item.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                          : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${specialization === item.id ? 'animate-pulse' : ''}`} />
                      <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Push Notifications Toggle */}
              {notificationsSupported && (
                <div className="space-y-3 pt-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">
                    {t('notifications') || 'Push Notifications'}
                  </label>
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    disabled={notificationsGranted}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      notificationsGranted
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default'
                        : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notificationsGranted ? 'bg-emerald-500 text-white' : 'bg-white/5 text-gray-500'}`}>
                        <BadgeCheck className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black uppercase tracking-tight">
                          {notificationsGranted ? (t('notifications_enabled') || 'Notifications Active') : (t('enable_notifications') || 'Enable Push Notifications')}
                        </p>
                        <p className="text-[9px] font-medium opacity-60">
                          {notificationsGranted ? (t('notifications_desc_active') || 'You will receive alerts on this device') : (t('notifications_desc_inactive') || 'Get alerted about new messages and activity')}
                        </p>
                      </div>
                    </div>
                    {!notificationsGranted && (
                      <div className="px-3 py-1 bg-purple-600 rounded-lg text-white text-[9px] font-black uppercase tracking-widest">
                        {t('activate') || 'Activate'}
                      </div>
                    )}
                  </button>
                </div>
              )}

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
    </div>
  )
}
