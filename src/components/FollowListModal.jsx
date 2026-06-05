import { useState, useEffect } from 'react'
import { Loader2, BadgeCheck, Gem, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchFollowers, fetchFollowing } from '../lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'
import { AnimatedPillGroup } from './AnimatedPillGroup'
import { GlassModal, glassInput } from './GlassModal'

/**
 * Modal showing a user's followers / following lists with two switchable tabs.
 * Clicking a user navigates to their profile via onViewProfile.
 */
export function FollowListModal({ userId, initialTab = 'followers', onClose, onViewProfile }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(initialTab)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const loader = tab === 'followers' ? fetchFollowers : fetchFollowing
    loader(userId).then(list => {
      if (!cancelled) {
        setUsers(list || [])
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [userId, tab])

  const handleSelect = (id) => {
    if (!id) return
    onClose()
    onViewProfile?.(id)
  }

  const filtered = users.filter(u =>
    (u?.nickname || '').toLowerCase().includes((search || '').toLowerCase())
  )

  return (
    <GlassModal
      onClose={onClose}
      z="z-[120]"
      padding="p-0"
      cardClassName="overflow-hidden flex flex-col max-h-[80vh]"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2 pr-12">
          <h3 className="text-sm font-bold text-white tracking-tight">{t('connections') || 'Connections'}</h3>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-1 pb-3 border-b border-white/10">
          <AnimatedPillGroup
            value={tab}
            onChange={setTab}
            options={[
              { value: 'followers', label: t('followers') || 'Followers' },
              { value: 'following', label: t('following') || 'Following' },
            ]}
            containerClassName="flex items-center gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/5"
            buttonClassName="lg-pill flex-1 py-2.5 text-xs font-black uppercase tracking-tighter rounded-xl"
            inactiveClassName="text-gray-500 hover:text-gray-300"
            pillClassName="rounded-xl"
            pillVariant="glass"
          />
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_people') || 'Search...'}
            className={`${glassInput} h-11 py-0`}
          />
        </div>

        {/* List */}
        <div className="h-[380px] overflow-y-auto custom-scrollbar px-3 pb-5 space-y-1 relative">
          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          ) : filtered.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
              <Users className="w-10 h-10 opacity-40" />
              <p className="text-sm font-bold">
                {tab === 'followers'
                  ? (t('no_followers') || 'No followers yet')
                  : (t('no_following') || 'Not following anyone yet')}
              </p>
            </div>
          ) : (
            <div className={loading ? 'opacity-40 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}>
              {filtered.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelect(u.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/5 transition-all text-left"
                >
                  <ProfileAvatar
                    avatarUrl={u.avatar_url}
                    workCount={u.finished_work_count}
                    size="sm"
                    isPro={u.isPro}
                    avatarFrame={u.avatar_frame}
                  />
                  <span className="flex items-center gap-1.5 font-bold text-white notranslate" translate="no" style={{ color: u.nickname_color || undefined }}>
                    {u.nickname || 'Unknown'}
                    {u.is_verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-purple-400 fill-purple-400/20 flex-shrink-0" />
                    )}
                    {u.isPro && (
                      <span className="pro-badge">
                        <Gem className="pro-badge-icon" />
                        <span className="pro-badge-text">Pro</span>
                      </span>
                    )}
                  </span>
                </button>
              ))
              }
            </div>
          )}
          {loading && users.length > 0 && (
            <div className="absolute inset-0 bg-[#15131d]/40 backdrop-blur-[1px] flex items-center justify-center z-10">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          )}
        </div>
    </GlassModal>
  )
}
