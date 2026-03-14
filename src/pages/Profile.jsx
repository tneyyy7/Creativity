import { useState, useRef, useEffect } from 'react'
import { User, Camera, Loader2, Save, Mail, AtSign, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase, upsertProfile, uploadAvatar } from '../lib/supabase'

export function Profile({ user, nickname, setNickname, avatarUrl, setAvatarUrl }) {
  const { t } = useTranslation()
  const fileInputRef = useRef(null)
  
  const [formNickname, setFormNickname] = useState(nickname)
  const [bio, setBio] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Fetch bio when component mounts
    const fetchBio = async () => {
      if (user) {
        const { data } = await supabase.from('profiles').select('bio').eq('id', user.id).single()
        if (data && data.bio) {
          setBio(data.bio)
        }
      }
    }
    fetchBio()
  }, [user])

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

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-2">{t('profile_title') || 'Your Profile'}</h1>
        <p className="text-gray-400 font-medium">{t('profile_desc') || 'Manage your personal space and identity.'}</p>
      </div>

      <div className="glass-card p-6 md:p-10">
        <div className="flex flex-col md:flex-row gap-10 items-start">
          
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4 mx-auto md:mx-0 shrink-0">
            <div 
              onClick={handleAvatarClick}
              className="relative w-32 h-32 md:w-40 md:h-40 rounded-[2rem] bg-gradient-to-tr from-purple-600 to-indigo-400 p-[3px] group shadow-2xl shadow-purple-900/40 cursor-pointer overflow-hidden transition-all hover:scale-105"
            >
              <div className="w-full h-full rounded-[30px] bg-[#0c0b11] overflow-hidden relative flex items-center justify-center">
                {isUploading ? (
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <User className="w-12 h-12 text-purple-500 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12" />
                )}
                
                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Camera className="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
            
            <p className="text-sm font-bold text-gray-400 text-center">
              {t('click_to_change') || 'Click to change'}
            </p>
          </div>

          {/* Form Section */}
          <div className="flex-1 w-full space-y-6">
            <form onSubmit={handleSaveProfile} className="space-y-6">
              
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
                     className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-white font-medium"
                    />
                 </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                 <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest pl-2">{t('bio') || 'Bio'}</label>
                 <textarea 
                   value={bio}
                   onChange={(e) => setBio(e.target.value)}
                   placeholder={t('bio_placeholder') || 'Tell the world about your art...'}
                   translate="no"
                   className="notranslate w-full h-32 p-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-white resize-none custom-scrollbar"
                 />
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <p className="text-sm font-bold text-red-500 text-center">{error}</p>
                </div>
              )}

              {/* Save Button */}
              <button 
                disabled={isSaving || isUploading}
                type="submit"
                className={`w-full py-4 font-black rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg ${
                  saveSuccess 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/30 hover:shadow-purple-900/50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    {t('saved') || 'Saved Successfully'}
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
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
