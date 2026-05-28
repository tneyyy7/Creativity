import { User } from 'lucide-react'

export function ProfileAvatar({ avatarUrl, workCount = 0, size = "md", className = "", isOnline = false, isPro = false, avatarFrame = "default" }) {
  // Rank thresholds - Lowered for faster progression feedback
  const getRankInfo = (count) => {
    if (count >= 150) return { id: 10, color: 'from-rose-500 to-rose-300', glow: 'shadow-rose-500/50', animate: true }
    if (count >= 100) return { id: 9, color: 'from-amber-400 to-yellow-200', glow: 'shadow-amber-500/40', animate: true }
    if (count >= 75) return { id: 8, color: 'from-fuchsia-600 to-purple-400', glow: 'shadow-fuchsia-500/40' }
    if (count >= 50) return { id: 7, color: 'from-indigo-600 to-blue-400', glow: 'shadow-indigo-500/30' }
    if (count >= 25) return { id: 6, color: 'from-yellow-400 to-yellow-200', glow: 'shadow-yellow-500/30' }
    if (count >= 15) return { id: 5, color: 'from-emerald-500 to-teal-300' }
    if (count >= 10) return { id: 4, color: 'from-purple-500 to-indigo-400' }
    if (count >= 3) return { id: 3, color: 'border-blue-400', glow: 'shadow-blue-500/20' }
    if (count >= 2) return { id: 2, color: 'border-orange-500' }
    if (count >= 1) return { id: 1, color: 'border-white/60' }
    return { id: 0, color: 'border-white/10' }
  }

  const getProFrameClass = (frame) => {
    switch (frame) {
      case 'gold':
        return 'bg-gradient-to-tr from-amber-500 via-yellow-300 to-amber-400 p-[4px] shadow-[0_0_24px_rgba(251,191,36,0.9)] animate-pulse'
      case 'diamond':
        return 'bg-gradient-to-tr from-cyan-400 via-sky-200 to-indigo-400 p-[4px] shadow-[0_0_24px_rgba(34,211,238,0.9)]'
      case 'fire':
        return 'bg-gradient-to-tr from-red-600 via-orange-400 to-yellow-400 p-[4px] shadow-[0_0_24px_rgba(239,68,68,1)] animate-pulse'
      case 'rainbow':
        return 'bg-gradient-to-tr from-red-500 via-green-400 to-blue-500 p-[4px] shadow-[0_0_24px_rgba(168,85,247,0.9)]'
      case 'ice':
        return 'bg-gradient-to-tr from-sky-300 via-teal-100 to-sky-200 p-[4px] shadow-[0_0_24px_rgba(125,211,252,1)]'
      default:
        return 'bg-gradient-to-tr from-cyan-400 via-fuchsia-500 to-purple-600 p-[4px] shadow-[0_0_22px_rgba(34,211,238,0.85)]'
    }
  }

  const rank = getRankInfo(workCount)
  
  const sizeClasses = {
    xs: "w-8 h-8 rounded-[9px]",
    sm: "w-10 h-10 rounded-[12px]",
    md: "w-12 h-12 rounded-[14px]",
    lg: "w-20 h-20 rounded-[22px]",
    // "profile" size: ideal for public profile header cards
    profile: "w-[110px] h-[110px] rounded-[26px]",
    xl: "w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem]"
  }

  const innerSizeClasses = {
    xs: "rounded-[7px]",
    sm: "rounded-[10px]",
    md: "rounded-[12px]",
    lg: "rounded-[19px]",
    profile: "rounded-[22px]",
    xl: "rounded-[2.2rem]"
  }

  const iconSizeClasses = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    profile: "w-10 h-10",
    xl: "w-12 h-12"
  }

  const isHighRank = rank.id >= 4
  
  return (
    <div className={`
      relative shrink-0 transition-all duration-500
      ${sizeClasses[size] || sizeClasses.md}
      ${isPro 
        ? getProFrameClass(avatarFrame) 
        : (isHighRank ? `bg-gradient-to-tr ${rank.color} p-[2.5px]` : `border-2 ${rank.color}`)
      }
      ${!isPro && rank.glow ? `shadow-lg ${rank.glow}` : ''}
      ${!isPro && rank.animate ? 'animate-pulse-subtle' : ''}
      ${className}
    `}>
      <div className={`
        w-full h-full bg-[#0c0b11] overflow-hidden flex items-center justify-center relative
        ${innerSizeClasses[size] || innerSizeClasses.md}
      `}>
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt="Avatar" 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
          />
        ) : (
          <User className={`${iconSizeClasses[size] || iconSizeClasses.md} text-purple-500/70`} />
        )}
      </div>

      {/* Online indicator dot */}
      {isOnline && (
        <span className={`
          absolute z-10 bg-emerald-500 rounded-full border-2 border-[#0c0b11] shadow-[0_0_8px_rgba(16,185,129,0.8)]
          ${size === 'xs' ? 'w-2.5 h-2.5 -bottom-0.5 -right-0.5' : 
            size === 'sm' ? 'w-3 h-3 -bottom-0.5 -right-0.5' : 
            size === 'md' ? 'w-3.5 h-3.5 -bottom-0.5 -right-0.5' : 
            size === 'lg' ? 'w-4.5 h-4.5 bottom-0 right-0' :
            size === 'profile' ? 'w-4 h-4 bottom-0 right-0' :
            'w-5.5 h-5.5 bottom-1 right-1'}
        `} />
      )}
    </div>
  )
}

