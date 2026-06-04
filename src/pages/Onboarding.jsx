import { useState } from 'react'
import { Check, ArrowRight, Loader2, Sparkles, Palette, Camera, Box, PenTool, Shapes, Monitor, Image as ImageIcon, User, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { LiquidGlassButton } from '../components/LiquidGlass'
import { sanitizeNickname, isValidNickname, NICKNAME_MAX_LENGTH } from '../lib/nicknameStyle'

const CATEGORIES = [
  { id: 'Digital', icon: Monitor, label: 'Digital Art' },
  { id: 'Painting', icon: Palette, label: 'Painting' },
  { id: 'Photography', icon: Camera, label: 'Photography' },
  { id: 'Sculpture', icon: Shapes, label: 'Sculpture' },
  { id: 'Design', icon: PenTool, label: 'Design' },
  { id: '3D', icon: Box, label: '3D' },
  { id: 'Sketching', icon: ImageIcon, label: 'Sketching' }
]

export function Onboarding({ user, onComplete }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [nickname, setNickname] = useState(user?.user_metadata?.full_name || user?.email?.split('@')[0] || '')
  const [specialization, setSpecialization] = useState('painter')
  const [selected, setSelected] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const toggleCategory = (id) => {
    setSelected(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleNextStep = async () => {
    setError('')
    const trimmedNickname = nickname.trim()

    if (!isValidNickname(trimmedNickname)) {
      setError(t('nickname_invalid') || "Nickname can only contain English letters, digits and underscore (max 10 characters)")
      return
    }

    setIsLoading(true)
    try {
      // Check if nickname is taken (only if they changed it, but let's just check anyway)
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('nickname', trimmedNickname)
        .neq('id', user.id) // Exclude current user if they somehow have it
        .maybeSingle()

      if (existingUser) {
        throw new Error(t('nickname_taken') || "This nickname is already taken")
      }

      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!user) {
      onComplete()
      return
    }

    setIsLoading(true)
    try {
      // 1. Update Profile (nickname, specialization, interests, is_onboarding_completed)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          nickname: nickname.trim(),
          specialization: specialization,
          interests: selected,
          is_onboarding_completed: true
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // 2. Follow Top Authors
      if (selected.length > 0) {
        const { data: paintings } = await supabase
          .from('paintings')
          .select('user_id')
          .in('category', selected)
          .order('views', { ascending: false })
          .limit(20)

        if (paintings && paintings.length > 0) {
          const topAuthorIds = [...new Set(paintings.map(p => p.user_id))].filter(id => id !== user.id).slice(0, 5)
          
          if (topAuthorIds.length > 0) {
            const follows = topAuthorIds.map(authorId => ({
              follower_id: user.id,
              following_id: authorId
            }))
            await supabase.from('follows').insert(follows)
          }
        }
      }
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-[#0c0b11] flex flex-col items-center justify-center p-6 sm:p-8 animate-in fade-in duration-700">
      <div className="max-w-2xl w-full flex flex-col items-center text-center space-y-8">
        <div className="w-20 h-20 bg-purple-600/20 rounded-full flex items-center justify-center shadow-2xl shadow-purple-900/30">
          <Sparkles className="w-10 h-10 text-purple-400" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter uppercase">
            {step === 1 ? t('complete_profile', 'Complete Profile') : t('welcome_to_creativity', 'Welcome to Creativity')}
          </h1>
          <p className="text-gray-400 font-medium text-sm sm:text-base max-w-md mx-auto">
            {step === 1 
              ? t('onboarding_profile_subtitle', 'Tell us how to call you and what you do.')
              : t('onboarding_subtitle', 'Choose 1 or more topics you are interested in. We will customize your feed.')}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 w-full max-w-md">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-500 uppercase tracking-tight text-left">{error}</p>
          </div>
        )}

        {step === 1 ? (
          <div className="w-full max-w-md space-y-6 pt-4 text-left">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    className={`lg-pill flex flex-col items-center gap-2 p-3 rounded-2xl ${
                      specialization === item.id ? 'lg-pill--active' : ''
                    }`}
                  >
                    <item.icon className={`w-6 h-6 ${specialization === item.id ? 'animate-pulse' : ''}`} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-8">
              <LiquidGlassButton
                onClick={handleNextStep}
                disabled={isLoading || !nickname.trim()}
                fullWidth
                accent
                config={{ radius: 18, padY: '1.25rem' }}
                className="font-black group"
              >
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                  <>
                    {t('continue', 'Continue')}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </LiquidGlassButton>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-3xl pt-4">
              {CATEGORIES.map(cat => {
                const isSelected = selected.includes(cat.id)
                const Icon = cat.icon
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 p-4 flex flex-col items-center justify-center gap-3 aspect-square
                      ${isSelected 
                        ? 'bg-purple-600 border-purple-400 shadow-lg shadow-purple-900/50' 
                        : 'bg-white/5 border-white/10 hover:border-purple-500/50 hover:bg-white/10'
                      }`}
                  >
                    <Icon className={`w-8 h-8 transition-transform duration-300 ${isSelected ? 'text-white scale-110' : 'text-gray-400 group-hover:text-purple-400'}`} />
                    <span className={`text-xs font-black uppercase tracking-wider ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {t(`cat_${cat.id.toLowerCase()}`, cat.label)}
                    </span>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center animate-in zoom-in">
                        <Check className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="w-full max-w-sm pt-8">
              <LiquidGlassButton
                onClick={handleComplete}
                disabled={isLoading}
                fullWidth
                accent
                config={{ radius: 18, padY: '1.25rem' }}
                className="font-black group"
              >
                {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                  <>
                    {t('complete', 'Complete')}
                    <Check className="w-5 h-5" />
                  </>
                )}
              </LiquidGlassButton>
              <button 
                onClick={handleComplete}
                className="w-full mt-4 text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest"
              >
                {t('skip', 'Skip for now')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
