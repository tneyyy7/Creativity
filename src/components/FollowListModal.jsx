import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, BadgeCheck, Gem, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchFollowers, fetchFollowing } from '../lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'

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

  const TabButton = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
        tab === id
          ? 'text-white border-purple-500'
          : 'text-gray-500 border-transparent hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#15131d] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-lg font-black text-white tracking-tight">{t('connections') || 'Connections'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors"
            aria-label={t('close') || 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 border-b border-white/10">
          <TabButton id="followers" label={t('followers') || 'Followers'} />
          <TabButton id="following" label={t('following') || 'Following'} />
        </div>

        {/* Search */}
        <div className="px-5 pt-4 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_people') || 'Search...'}
            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-purple-500/50 outline-none"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-5 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
              <Users className="w-10 h-10 opacity-40" />
              <p className="text-sm font-bold">
                {tab === 'followers'
                  ? (t('no_followers') || 'No followers yet')
                  : (t('no_following') || 'Not following anyone yet')}
              </p>
            </div>
          ) : (
            filtered.map(u => (
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
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
