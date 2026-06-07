import { User } from 'lucide-react'

export function ProfileAvatar({ avatarUrl, workCount = 0, size = "md", className = "", isOnline = false, isPro = false, avatarFrame = "default", children }) {
  const getRankInfo = (count) => {
    if (count >= 150) return { id: 10, color: 'from-rose-500 to-rose-300', glow: 'shadow-rose-500/25', animate: true }
    if (count >= 100) return { id: 9, color: 'from-amber-400 to-yellow-200', glow: 'shadow-amber-500/20', animate: true }
    if (count >= 75) return { id: 8, color: 'from-fuchsia-600 to-purple-400', glow: 'shadow-fuchsia-500/20' }
    if (count >= 50) return { id: 7, color: 'from-indigo-600 to-blue-400', glow: 'shadow-indigo-500/15' }
    if (count >= 25) return { id: 6, color: 'from-yellow-400 to-yellow-200', glow: 'shadow-yellow-500/15' }
    if (count >= 15) return { id: 5, color: 'from-emerald-500 to-teal-300' }
    if (count >= 10) return { id: 4, color: 'from-purple-500 to-indigo-400' }
    if (count >= 3) return { id: 3, color: 'border-blue-400', glow: 'shadow-blue-500/10' }
    if (count >= 2) return { id: 2, color: 'border-orange-500' }
    if (count >= 1) return { id: 1, color: 'border-white/60' }
    return { id: 0, color: 'border-white/10' }
  }

  // Returns gradient bg, outer glow shadow, and whether the frame should pulse.
  // animate-pulse is applied ONLY to the frame layer div, not the image wrapper,
  // so the avatar photo is never dimmed by the opacity animation.
  const getProFrame = (frame) => {
    switch (frame) {
      case 'gold':
        return { bg: 'bg-gradient-to-tr from-amber-500 via-yellow-300 to-amber-400', shadow: 'shadow-[0_0_5px_rgba(251,191,36,0.2)]', animate: true }
      case 'diamond':
        return { bg: 'bg-gradient-to-tr from-cyan-400 via-sky-200 to-indigo-400', shadow: 'shadow-[0_0_5px_rgba(34,211,238,0.15)]', animate: false }
      case 'fire':
        return { bg: 'bg-gradient-to-tr from-red-600 via-orange-400 to-yellow-400', shadow: 'shadow-[0_0_5px_rgba(239,68,68,0.25)]', animate: true }
      case 'rainbow':
        return { bg: 'bg-gradient-to-tr from-red-500 via-green-400 to-blue-500', shadow: 'shadow-[0_0_4px_rgba(239,68,68,0.15),0_0_4px_rgba(59,130,246,0.15)]', animate: false }
      case 'ice':
        return { bg: 'bg-gradient-to-tr from-sky-300 via-teal-100 to-sky-200', shadow: 'shadow-[0_0_5px_rgba(125,211,252,0.2)]', animate: false }
      default:
        return { bg: 'bg-gradient-to-tr from-cyan-400 via-fuchsia-500 to-purple-600', shadow: 'shadow-[0_0_4px_rgba(34,211,238,0.12),0_0_4px_rgba(168,85,247,0.12)]', animate: false }
    }
  }

  const rank = getRankInfo(workCount)
  const isHighRank = rank.id >= 4

  // Size of the outer container
  const sizeClasses = {
    xs: "w-8 h-8",
    sm: "w-10 h-10",
    md: "w-12 h-12",
    lg: "w-20 h-20",
    profile: "w-24 h-24 sm:w-[110px] sm:h-[110px]",
    xl: "w-32 h-32 md:w-40 md:h-40"
  }

  // Outer frame border-radius in px. The inner image radius and frame inset are
  // derived from these so the two rounded rects stay perfectly concentric
  // (innerRadius = outerRadius - frameWidth), otherwise the gradient frame looks
  // uneven / "crooked" at the corners.
  const outerRadiusPx = {
    xs: 9,
    sm: 12,
    md: 14,
    lg: 22,
    profile: 26,
    xl: 40
  }

  const iconSizeClasses = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    profile: "w-10 h-10",
    xl: "w-12 h-12"
  }

  const sz = sizeClasses[size] || sizeClasses.md
  const iconSize = iconSizeClasses[size] || iconSizeClasses.md

  const proFrame = isPro ? getProFrame(avatarFrame) : null

  // Concentric corner geometry: the image is inset by the frame width, and its
  // border-radius is reduced by the same amount so the gradient frame keeps a
  // uniform thickness all the way around (including the corners).
  const outerR = outerRadiusPx[size] || outerRadiusPx.md
  const frameWidth = isPro ? 4 : isHighRank ? 2.5 : 0
  const borderOffset = (!isPro && !isHighRank) ? 2 : 0
  const innerR = Math.max(0, outerR - frameWidth - borderOffset)
  const imageScaleClass = rank.id > 0 ? 'scale-[1.04] group-hover:scale-[1.12]' : 'group-hover:scale-110'

  return (
    <div
      style={{ borderRadius: `${outerR}px` }}
      className={`
      relative shrink-0 transition-all duration-500 bg-[#0c0b11]
      ${sz}
      ${isPro
        ? proFrame.shadow
        : isHighRank
          ? `shadow-lg ${rank.glow || ''}`
          : `border-2 ${rank.color} ${rank.glow ? `shadow-lg ${rank.glow}` : ''}`
      }
      ${className}
    `}>

      {/* ── Frame gradient layer ─────────────────────────────────────────────
          Absolutely positioned behind the image. When animate-pulse is needed
          it is applied here only, so the avatar photo opacity is never affected. */}
      {isPro && (
        <div style={{ borderRadius: `${outerR}px` }} className={`absolute inset-0 ${proFrame.bg} ${proFrame.animate ? 'animate-pulse' : ''}`} />
      )}
      {!isPro && isHighRank && (
        <div style={{ borderRadius: `${outerR}px` }} className={`absolute inset-0 bg-gradient-to-tr ${rank.color} ${rank.animate ? 'animate-pulse' : ''}`} />
      )}

      {/* ── Image container ──────────────────────────────────────────────────
          Gradient frames need an inset so the frame remains visible. Regular
          rank borders sit on the outer element, so the photo fills the full box
          without leaving a gap between the avatar and the border. */}
      <div
        style={{ borderRadius: `${innerR}px`, inset: `${frameWidth}px` }}
        className="absolute bg-[#0c0b11] overflow-hidden flex items-center justify-center">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar"
            className={`block w-full h-full object-cover object-center transition-transform duration-500 ${imageScaleClass}`}
          />
        ) : (
          <User className={`${iconSize} text-purple-500/70`} />
        )}
        {children}
      </div>

      {/* Online indicator */}
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
