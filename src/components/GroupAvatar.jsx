import { Users } from 'lucide-react'

// Small avatar used for group chats (image if set, otherwise a Users glyph).
export function GroupAvatar({ avatarUrl, size = 'sm' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  return (
    <div className={`${dim} rounded-2xl overflow-hidden flex items-center justify-center bg-purple-600/15 border border-purple-500/20 flex-shrink-0`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <Users className="w-1/2 h-1/2 text-purple-300" />
      )}
    </div>
  )
}
