import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, BadgeCheck, Gem, Users, Camera, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchFriends, uploadAvatar, createGroupChat, addGroupMembers } from '../lib/supabase'
import { ProfileAvatar } from './ProfileAvatar'

/**
 * Friend picker used both to create a new group chat and to add members to an
 * existing one (mode === 'add'). On success it calls onCreated with the new/updated
 * group object so the parent can open or refresh it.
 */
export function CreateGroupModal({ currentUser, mode = 'create', groupId = null, existingMemberIds = [], onClose, onCreated }) {
  const { t } = useTranslation()
  const isAddMode = mode === 'add'

  const [loading, setLoading] = useState(true)
  const [friends, setFriends] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchFriends(currentUser.id).then((list) => {
      if (cancelled) return
      const exclude = new Set(existingMemberIds)
      const profiles = (list || [])
        .map((f) => f.profile)
        .filter((p) => p && !exclude.has(p.id))
      setFriends(profiles)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [currentUser.id])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploadingAvatar(true)
      const url = await uploadAvatar(file, currentUser.id)
      setAvatarUrl(url)
    } catch (err) {
      console.error('Group avatar upload error:', err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const canSubmit = isAddMode
    ? selected.size > 0
    : name.trim().length > 0 && selected.size > 0

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return
    try {
      setSubmitting(true)
      const memberIds = [...selected]
      if (isAddMode) {
        await addGroupMembers(groupId, memberIds)
        onCreated?.({ id: groupId, addedMemberIds: memberIds })
      } else {
        const group = await createGroupChat(currentUser.id, name.trim(), avatarUrl, memberIds)
        onCreated?.(group)
      }
      onClose()
    } catch (err) {
      console.error('Create/add group error:', err)
      setSubmitting(false)
    }
  }

  const filtered = friends.filter((u) =>
    (u?.nickname || '').toLowerCase().includes((search || '').toLowerCase())
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#15131d] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-lg font-black text-white tracking-tight">
            {isAddMode ? (t('add_members') || 'Add members') : (t('create_group') || 'New group')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors"
            aria-label={t('close') || 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Group name + avatar (create mode only) */}
        {!isAddMode && (
          <div className="px-5 pt-2 pb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 hover:bg-white/10 transition-colors"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              ) : avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-gray-400" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('group_name') || 'Group name'}
              maxLength={50}
              className="flex-1 h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-purple-500/50 outline-none"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-1 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_friends_only') || 'Search among friends...'}
            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-purple-500/50 outline-none"
          />
        </div>

        {/* Friend list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-2 space-y-1 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
              <Users className="w-10 h-10 opacity-40" />
              <p className="text-sm font-bold text-center px-6">
                {friends.length === 0
                  ? (t('no_friends_to_add') || 'No friends to add yet')
                  : (t('no_users_found') || 'No one found')}
              </p>
            </div>
          ) : (
            filtered.map((u) => {
              const isSel = selected.has(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all text-left ${isSel ? 'bg-purple-600/15' : 'hover:bg-white/5'}`}
                >
                  <ProfileAvatar
                    avatarUrl={u.avatar_url}
                    workCount={u.finished_work_count}
                    size="sm"
                    isPro={u.isPro}
                    avatarFrame={u.avatar_frame}
                  />
                  <span className="flex-1 flex items-center gap-1.5 font-bold text-white notranslate" translate="no" style={{ color: u.nickname_color || undefined }}>
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
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${isSel ? 'bg-purple-600 border-purple-600' : 'border-white/20'}`}>
                    {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:opacity-50 text-white font-black text-sm tracking-wide transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isAddMode ? (
              `${t('add_members') || 'Add members'}${selected.size ? ` (${selected.size})` : ''}`
            ) : (
              `${t('create_group') || 'Create group'}${selected.size ? ` (${selected.size})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
