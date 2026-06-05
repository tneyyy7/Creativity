import { cleanProfile, enrichProfilesWithProData, supabase } from './core'

export const sendMessage = async (senderId, receiverId, content, replyToId = null) => {
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      reply_to_id: replyToId
    }])
    .select()
    .single()

  if (error) throw error
  return data
}


export const fetchMessages = async (userId, otherId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}


export const fetchConversations = async (userId) => {
  try {
    // Get all messages where user is sender or receiver to find conversation partners (DMs only)
    const { data: messages, error: mError } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, created_at, is_read')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .is('group_id', null)
      .order('created_at', { ascending: false })

    if (mError) throw mError
    if (!messages || messages.length === 0) return []

    // Group by other user and store last message timestamp + unread count
    const conversationMap = new Map()

    messages.forEach(m => {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id
      if (!conversationMap.has(otherId)) {
        conversationMap.set(otherId, {
          last_message_at: m.created_at,
          unread_count: 0
        })
      }

      // Increment unread count if message is to current user and unread
      if (m.receiver_id === userId && !m.is_read) {
        conversationMap.get(otherId).unread_count++
      }
    })

    const otherUserIds = Array.from(conversationMap.keys()).filter(Boolean)
    if (otherUserIds.length === 0) return []

    // Fetch profiles for these users
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen')
      .in('id', otherUserIds)

    if (pError) throw pError

    // Combine profiles with conversation metadata and sort
    const cleaned = profiles.map(p => ({
      ...cleanProfile(p),
      unread_count: conversationMap.get(p.id).unread_count,
      last_message_at: conversationMap.get(p.id).last_message_at
    }))
    const enriched = await enrichProfilesWithProData(cleaned)
    return enriched.sort((a, b) => conversationMap.get(b.id).last_message_at.localeCompare(conversationMap.get(a.id).last_message_at))
  } catch (err) {
    console.error("fetchConversations error:", err)
    return []
  }
}


export const fetchTotalUnreadCount = async (userId) => {
  try {
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false)

    if (error) throw error
    return count || 0
  } catch (err) {
    console.error("fetchTotalUnreadCount error:", err)
    return 0
  }
}


export const markAsRead = async (receiverId, senderId) => {
  // Stamp read_at so the sender can see exactly when their message was read.
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('receiver_id', receiverId)
    .eq('sender_id', senderId)
    .eq('is_read', false)

  if (error) {
    // Fallback for databases that haven't added the read_at column yet.
    const { error: fallbackError } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', receiverId)
      .eq('sender_id', senderId)
      .eq('is_read', false)
    if (fallbackError) throw fallbackError
  }
}


export const updateChatPresence = async (userId, partnerId) => {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        active_chat_with_id: partnerId || null,
        active_chat_updated_at: partnerId ? new Date().toISOString() : null
      })
      .eq('id', userId)

    if (error) throw error
  } catch (err) {
    console.error("updateChatPresence error:", err)
  }
}


export const deleteMessage = async (id) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id)

  if (error) throw error
}


export const updateMessage = async (id, content) => {
  const { data, error } = await supabase
    .from('messages')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// --- GROUP CHAT LOGIC ---
// Group messages reuse the shared `messages` table via a nullable `group_id`,
// so reactions / replies / custom emoji / themes all work unchanged. See
// supabase/migrations/group_chats.sql for the schema and RLS.


export const createGroupChat = async (creatorId, name, avatarUrl, memberIds = []) => {
  // Generate the id client-side and insert WITHOUT a RETURNING (.select()): a
  // brand-new group has no members yet, so the group_chats SELECT policy
  // (membership-based) would otherwise block reading the row straight back.
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const createdAt = new Date().toISOString()
  const { error } = await supabase
    .from('group_chats')
    .insert([{ id, name, avatar_url: avatarUrl || null, created_by: creatorId, created_at: createdAt }])
  if (error) throw error

  // Insert the creator's admin row FIRST and on its own: the RLS check for the
  // member rows relies on is_group_admin(group_id, auth.uid()), which only
  // returns true once the admin row is actually committed.
  const { error: adminError } = await supabase
    .from('group_members')
    .insert([{ group_id: id, user_id: creatorId, role: 'admin' }])
  if (adminError) throw adminError

  // Then add the rest as regular members. De-dupe and drop the creator in case
  // it slipped in from the friend picker.
  const uniqueMembers = [...new Set(memberIds.filter((mid) => mid && mid !== creatorId))]
  if (uniqueMembers.length > 0) {
    const { error: mError } = await supabase
      .from('group_members')
      .insert(uniqueMembers.map((mid) => ({ group_id: id, user_id: mid, role: 'member' })))
    if (mError) throw mError
  }

  return { id, name, avatar_url: avatarUrl || null, created_by: creatorId, created_at: createdAt, is_group: true }
}

// Returns the groups the user belongs to, shaped like conversation entries
// (is_group, last_message_at, unread_count) so the chat list can merge them.

export const fetchGroupChats = async (userId) => {
  try {
    const { data: memberships, error: memErr } = await supabase
      .from('group_members')
      .select('group_id, last_read_at')
      .eq('user_id', userId)
    if (memErr) throw memErr
    if (!memberships || memberships.length === 0) return []

    const groupIds = memberships.map((m) => m.group_id)
    const lastReadMap = new Map(memberships.map((m) => [m.group_id, m.last_read_at]))

    const { data: groups, error: gErr } = await supabase
      .from('group_chats')
      .select('id, name, avatar_url, created_by, created_at')
      .in('id', groupIds)
    if (gErr) throw gErr

    // One query for all group messages metadata, then compute last activity +
    // unread counts client-side (typical user has only a handful of groups).
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('group_id, sender_id, created_at')
      .in('group_id', groupIds)
    if (msgErr) throw msgErr

    const lastAtMap = new Map()
    const unreadMap = new Map()
    ;(msgs || []).forEach((m) => {
      const prev = lastAtMap.get(m.group_id)
      if (!prev || m.created_at > prev) lastAtMap.set(m.group_id, m.created_at)
      const lastRead = lastReadMap.get(m.group_id)
      if (m.sender_id !== userId && (!lastRead || m.created_at > lastRead)) {
        unreadMap.set(m.group_id, (unreadMap.get(m.group_id) || 0) + 1)
      }
    })

    return (groups || []).map((g) => ({
      ...g,
      is_group: true,
      last_message_at: lastAtMap.get(g.id) || g.created_at,
      unread_count: unreadMap.get(g.id) || 0
    }))
  } catch (err) {
    console.error('fetchGroupChats error:', err)
    return []
  }
}


export const fetchGroupMessages = async (groupId) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}


export const sendGroupMessage = async (senderId, groupId, content, replyToId = null) => {
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      sender_id: senderId,
      receiver_id: null,
      group_id: groupId,
      content,
      reply_to_id: replyToId
    }])
    .select()
    .single()
  if (error) throw error
  return data
}


export const fetchGroupMembers = async (groupId) => {
  const { data: members, error } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at, last_read_at')
    .eq('group_id', groupId)
  if (error) throw error
  if (!members || members.length === 0) return []

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, is_verified, finished_work_count, specialization, last_seen')
    .in('id', members.map((m) => m.user_id))
  if (pErr) throw pErr

  const enriched = await enrichProfilesWithProData((profiles || []).map((p) => cleanProfile(p)))
  const roleMap = new Map(members.map((m) => [m.user_id, m]))
  return enriched.map((p) => ({
    ...p,
    role: roleMap.get(p.id)?.role || 'member',
    joined_at: roleMap.get(p.id)?.joined_at,
    last_read_at: roleMap.get(p.id)?.last_read_at
  }))
}


export const addGroupMembers = async (groupId, memberIds = []) => {
  const unique = [...new Set(memberIds.filter(Boolean))]
  if (unique.length === 0) return
  const rows = unique.map((id) => ({ group_id: groupId, user_id: id, role: 'member' }))
  const { error } = await supabase
    .from('group_members')
    .upsert(rows, { onConflict: 'group_id,user_id', ignoreDuplicates: true })
  if (error) throw error
}


export const removeGroupMember = async (groupId, userId) => {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw error
}


export const leaveGroup = async (groupId, userId) => removeGroupMember(groupId, userId)


export const updateGroupChat = async (groupId, updates) => {
  const { data, error } = await supabase
    .from('group_chats')
    .update(updates)
    .eq('id', groupId)
    .select()
    .single()
  if (error) throw error
  return data
}


export const markGroupRead = async (groupId, userId) => {
  const { error } = await supabase
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error && error.code !== 'PGRST116') console.error('markGroupRead error:', error)
}




export async function fetchChatTheme(userId, friendId) {
  try {
    if (!userId || !friendId) return 'default'
    const { data, error } = await supabase
      .from('user_chat_themes')
      .select('theme')
      .eq('user_id', userId)
      .eq('friend_id', friendId)
      .maybeSingle()

    if (error) throw error
    return data?.theme || 'default'
  } catch (e) {
    console.error('fetchChatTheme error:', e)
    return 'default'
  }
}


export async function saveChatTheme(userId, friendId, theme) {
  try {
    if (!userId || !friendId) return null
    const { data, error } = await supabase
      .from('user_chat_themes')
      .upsert(
        {
          user_id: userId,
          friend_id: friendId,
          theme,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id,friend_id' }
      )
      .select()
      .single()

    if (error) throw error
    return data
  } catch (e) {
    console.error('saveChatTheme error:', e)
    throw e
  }
}

// Whether the current user has muted notifications from a given chat.
// `chatId` is the friend's id for direct chats or the group's id for groups.

export async function fetchChatMute(userId, chatId) {
  try {
    if (!userId || !chatId) return false
    const { data, error } = await supabase
      .from('chat_mutes')
      .select('chat_id')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle()

    if (error) throw error
    return !!data
  } catch (e) {
    console.error('fetchChatMute error:', e)
    return false
  }
}

// Mute or unmute a chat for the current user. Returns the new muted state.

export async function toggleChatMute(userId, chatId, muted, isGroup = false) {
  try {
    if (!userId || !chatId) return false
    if (muted) {
      const { error } = await supabase
        .from('chat_mutes')
        .upsert(
          { user_id: userId, chat_id: chatId, is_group: isGroup },
          { onConflict: 'user_id,chat_id' }
        )
      if (error) throw error
      return true
    } else {
      const { error } = await supabase
        .from('chat_mutes')
        .delete()
        .eq('user_id', userId)
        .eq('chat_id', chatId)
      if (error) throw error
      return false
    }
  } catch (e) {
    console.error('toggleChatMute error:', e)
    throw e
  }
}

// All chat ids the user has muted. Used to annotate the conversation list.

export async function fetchChatMutes(userId) {
  try {
    if (!userId) return []
    const { data, error } = await supabase
      .from('chat_mutes')
      .select('chat_id')
      .eq('user_id', userId)
    if (error) throw error
    return (data || []).map((r) => r.chat_id)
  } catch (e) {
    console.error('fetchChatMutes error:', e)
    return []
  }
}

// All chat ids the user has pinned, newest pin first.

export async function fetchChatPins(userId) {
  try {
    if (!userId) return []
    const { data, error } = await supabase
      .from('chat_pins')
      .select('chat_id')
      .eq('user_id', userId)
    if (error) throw error
    return (data || []).map((r) => r.chat_id)
  } catch (e) {
    console.error('fetchChatPins error:', e)
    return []
  }
}

// Pin or unpin a chat for the current user. Returns the new pinned state.

export async function toggleChatPin(userId, chatId, pinned, isGroup = false) {
  try {
    if (!userId || !chatId) return false
    if (pinned) {
      const { error } = await supabase
        .from('chat_pins')
        .upsert(
          { user_id: userId, chat_id: chatId, is_group: isGroup },
          { onConflict: 'user_id,chat_id' }
        )
      if (error) throw error
      return true
    } else {
      const { error } = await supabase
        .from('chat_pins')
        .delete()
        .eq('user_id', userId)
        .eq('chat_id', chatId)
      if (error) throw error
      return false
    }
  } catch (e) {
    console.error('toggleChatPin error:', e)
    throw e
  }
}

// Map of chat_id -> hidden_at for chats the user has "deleted" from their list.

export async function fetchHiddenChats(userId) {
  try {
    if (!userId) return new Map()
    const { data, error } = await supabase
      .from('chat_hides')
      .select('chat_id, hidden_at')
      .eq('user_id', userId)
    if (error) throw error
    return new Map((data || []).map((r) => [r.chat_id, r.hidden_at]))
  } catch (e) {
    console.error('fetchHiddenChats error:', e)
    return new Map()
  }
}

// Hide a chat from the user's list. Non-destructive: the chat reappears once a
// message newer than this moment arrives. A pin is cleared at the same time.

export async function hideConversation(userId, chatId, isGroup = false) {
  try {
    if (!userId || !chatId) return
    const { error } = await supabase
      .from('chat_hides')
      .upsert(
        { user_id: userId, chat_id: chatId, is_group: isGroup, hidden_at: new Date().toISOString() },
        { onConflict: 'user_id,chat_id' }
      )
    if (error) throw error
    // A hidden chat should not stay pinned.
    await supabase.from('chat_pins').delete().eq('user_id', userId).eq('chat_id', chatId)
  } catch (e) {
    console.error('hideConversation error:', e)
    throw e
  }
}


export async function updateMessageReactions(messageId, reactions) {
  const { data, error } = await supabase
    .from('messages')
    .update({ reactions })
    .eq('id', messageId)
    .select()
    .single()

  if (error) throw error
  return data
}





