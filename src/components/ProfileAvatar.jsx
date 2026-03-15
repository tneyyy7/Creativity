import { User } from 'lucide-react'

export function ProfileAvatar({ avatarUrl, workCount = 0, size = "md", className = "" }) {
  // Rank thresholds
  const getRankInfo = (count) => {
    if (count >= 200) return { id: 10, color: 'from-rose-500 to-rose-300', glow: 'shadow-rose-500/50', animate: true }
    if (count >= 175) return { id: 9, color: 'from-amber-400 to-yellow-200', glow: 'shadow-amber-500/40', animate: true }
    if (count >= 150) return { id: 8, color: 'from-fuchsia-600 to-purple-400', glow: 'shadow-fuchsia-500/40' }
    if (count >= 125) return { id: 7, color: 'from-indigo-600 to-blue-400', glow: 'shadow-indigo-500/30' }
    if (count >= 100) return { id: 6, color: 'from-yellow-400 to-yellow-200', glow: 'shadow-yellow-500/30' }
    if (count >= 75) return { id: 5, color: 'from-emerald-500 to-teal-300' }
    if (count >= 50) return { id: 4, color: 'from-purple-500 to-indigo-400' }
    if (count >= 30) return { id: 3, color: 'border-blue-500/50' }
    if (count >= 15) return { id: 2, color: 'border-orange-400/40' }
    if (count >= 5) return { id: 1, color: 'border-gray-400/30' }
    return { id: 0, color: 'border-white/5' }
  }

  const rank = getRankInfo(workCount)
  
  const sizeClasses = {
    xs: "w-8 h-8 rounded-lg",
    sm: "w-10 h-10 rounded-[12px]",
    md: "w-12 h-12 rounded-[14px]",
    lg: "w-20 h-20 rounded-[20px]",
    xl: "w-32 h-32 md:w-40 md:h-40 rounded-[2rem]"
  }

  const innerSizeClasses = {
    xs: "rounded-[7px]",
    sm: "rounded-[11px]",
    md: "rounded-[13px]",
    lg: "rounded-[19px]",
    xl: "rounded-[30px]"
  }

  const iconSizeClasses = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12"
  }

  // Base styling: for higher ranks, use a gradient border (via p-[2px] Trick)
  // For lower ranks (1-3), just a simple border
  const isHighRank = rank.id >= 4
  
  return (
    <div className={`
      relative shrink-0 transition-all duration-500
      ${sizeClasses[size] || sizeClasses.md}
      ${isHighRank ? `bg-gradient-to-tr ${rank.color} p-[2px]` : `border ${rank.color}`}
      ${rank.glow ? `shadow-lg ${rank.glow}` : ''}
      ${rank.animate ? 'animate-pulse-subtle' : ''}
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
    </div>
  )
}
