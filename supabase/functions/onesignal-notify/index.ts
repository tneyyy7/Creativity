import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Localized push strings. Keep keys/phrasing in sync with src/i18n/config.js.
// Templated emojis are intentionally omitted — only user-typed content keeps emojis.
type Dict = Record<string, string>
const LANGS = ["en", "ru", "it"] as const
const TRANSLATIONS: Record<string, Dict> = {
  en: {
    new_message: "New message",
    message_from: "Message from",
    like_title: "New like",
    like_msg: "liked your post",
    comment_title: "New comment",
    comment_msg: "commented on your post",
    friend_request_title: "Friend request",
    friend_request_msg: "wants to be friends",
    friend_accept_title: "Request accepted",
    friend_accept_msg: "accepted your friend request",
    follow_title: "New follower",
    follow_msg: "followed you",
    bookmark_title: "Added to favorites",
    bookmark_msg: "added your work to bookmarks",
    boost_title: "New boost",
    boost_msg: "boosted your work",
    mention_title: "New mention",
    mention_msg: "mentioned you",
    default_msg: "You have a new notification",
    share_profile: "Shared a profile",
    share_post: "Shared a post",
    share_story: "Story reply",
    sticker: "Sticker",
  },
  ru: {
    new_message: "Новое сообщение",
    message_from: "Сообщение от",
    like_title: "Новый лайк",
    like_msg: "оценил вашу работу",
    comment_title: "Новый комментарий",
    comment_msg: "прокомментировал вашу работу",
    friend_request_title: "Запрос в друзья",
    friend_request_msg: "хочет дружить с вами",
    friend_accept_title: "Запрос принят",
    friend_accept_msg: "принял(а) ваш запрос в друзья",
    follow_title: "Новый подписчик",
    follow_msg: "подписался(ась) на ваши обновления",
    bookmark_title: "В избранном",
    bookmark_msg: "добавил(а) вашу работу в избранное",
    boost_title: "Новый буст",
    boost_msg: "продвинул(а) вашу работу",
    mention_title: "Новое упоминание",
    mention_msg: "упомянул(а) вас",
    default_msg: "У вас новое уведомление",
    share_profile: "Поделился(ась) профилем",
    share_post: "Поделился(ась) публикацией",
    share_story: "Ответ на историю",
    sticker: "Стикер",
  },
  it: {
    new_message: "Nuovo messaggio",
    message_from: "Messaggio da",
    like_title: "Nuovo mi piace",
    like_msg: "ha messo mi piace al tuo post",
    comment_title: "Nuovo commento",
    comment_msg: "ha commentato il tuo post",
    friend_request_title: "Richiesta di amicizia",
    friend_request_msg: "vuole essere tuo amico",
    friend_accept_title: "Richiesta accettata",
    friend_accept_msg: "ha accettato la tua richiesta di amicizia",
    follow_title: "Nuovo follower",
    follow_msg: "ha iniziato a seguirti",
    bookmark_title: "Aggiunto ai preferiti",
    bookmark_msg: "ha aggiunto la tua opera ai preferiti",
    boost_title: "Nuovo boost",
    boost_msg: "ha messo in evidenza la tua opera",
    mention_title: "Nuova menzione",
    mention_msg: "ti ha menzionato",
    default_msg: "Hai una nuova notifica",
    share_profile: "Ha condiviso un profilo",
    share_post: "Ha condiviso un post",
    share_story: "Risposta alla storia",
    sticker: "Sticker",
  },
}

// Turn raw message content into a human-readable push preview.
// Internal markers like custom-emoji tags or share payloads must never leak into notifications.
// User-typed text/emojis are preserved as-is; only our own share previews are localized.
function cleanMessagePreview(content: string, d: Dict): string {
  if (!content) return ""

  if (content.startsWith("[PROFILE_SHARE:")) return d.share_profile
  if (content.startsWith("[POST_SHARE:")) return d.share_post
  if (content.startsWith("[STORY_SHARE:")) return d.share_story

  // Replace custom-emoji stickers [EMOJI:url:name] with the sticker glyph.
  const cleaned = content.replace(/\[EMOJI:https?:\/\/[^:]+:[^\]]+\]/g, "🖼️").trim()
  return cleaned || d.sticker
}

// Build the title + message for a single language.
function buildText(
  d: Dict, 
  notifType: string, 
  record: any, 
  nickname: string | null,
  groupName: string | null = null
): { title: string; message: string } {
  if (notifType === 'message') {
    if (groupName) {
      return {
        title: groupName,
        message: nickname ? `${nickname}: ${cleanMessagePreview(record.content, d)}` : cleanMessagePreview(record.content, d),
      }
    }
    return {
      title: nickname ? `${d.message_from} ${nickname}` : d.new_message,
      message: cleanMessagePreview(record.content, d),
    }
  }

  let title = "Creativity"
  let message = d.default_msg

  if (notifType === 'like') {
    title = d.like_title
    message = d.like_msg
  } else if (notifType === 'comment') {
    title = d.comment_title
    message = `${d.comment_msg}: ${record.content || ''}`
  } else if (notifType === 'friend_request') {
    title = d.friend_request_title
    message = d.friend_request_msg
  } else if (notifType === 'friend_accept') {
    title = d.friend_accept_title
    message = d.friend_accept_msg
  } else if (notifType === 'follow') {
    title = d.follow_title
    message = d.follow_msg
  } else if (notifType === 'bookmark') {
    title = d.bookmark_title
    message = d.bookmark_msg
  } else if (notifType === 'boost') {
    title = d.boost_title
    message = d.boost_msg
  } else if (notifType === 'mention') {
    title = d.mention_title
    message = d.mention_msg
  } else {
    message = record.content || d.default_msg
  }

  if (nickname) {
    message = `${nickname} ${message}`
  }
  return { title, message }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { record, table, type } = payload

    console.log(`Notification trigger for ${table} (${type})`)

    let recipientIds: string[] = []
    let actorId = null
    let notifType = null // 'message' for chat, otherwise the notifications.type value
    let groupName: string | null = null

    if (table === 'messages' && type === 'INSERT') {
      actorId = record.sender_id
      notifType = 'message'

      if (record.group_id) {
        // Group message: notify all members of the group except the sender
        try {
          const { data: members, error: membersErr } = await supabase
            .from('group_members')
            .select('user_id')
            .eq('group_id', record.group_id)

          if (membersErr) throw membersErr

          const allMembers = members?.map((m: any) => m.user_id) || []
          const otherMembers = allMembers.filter((uid: string) => uid !== actorId)

          if (otherMembers.length > 0) {
            // Filter out users who have muted this group chat
            const { data: mutes, error: mutesErr } = await supabase
              .from('chat_mutes')
              .select('user_id')
              .eq('chat_id', record.group_id)

            if (mutesErr) throw mutesErr

            const mutedUsers = new Set(mutes?.map((m: any) => m.user_id) || [])
            recipientIds = otherMembers.filter((uid: string) => !mutedUsers.has(uid))
          }

          // Fetch group name
          const { data: group, error: groupErr } = await supabase
            .from('group_chats')
            .select('name')
            .eq('id', record.group_id)
            .maybeSingle()

          if (groupErr) throw groupErr
          groupName = group?.name || null

        } catch (err) {
          console.error("Error processing group message notification:", err)
        }
      } else {
        // Direct message
        const receiverId = record.receiver_id
        if (receiverId) {
          try {
            // Check if receiver muted sender
            const { data: mute } = await supabase
              .from('chat_mutes')
              .select('chat_id')
              .eq('user_id', receiverId)
              .eq('chat_id', actorId)
              .maybeSingle()

            if (mute) {
              console.log(`Skip push: recipient ${receiverId} muted chat with ${actorId}`)
            } else {
              // Check if receiver is actively in the chat
              let isActivelyInChat = false
              try {
                const { data: recipientProfile } = await supabase
                  .from('profiles')
                  .select('active_chat_with_id, active_chat_updated_at')
                  .eq('id', receiverId)
                  .single()

                if (recipientProfile) {
                  const { active_chat_with_id, active_chat_updated_at } = recipientProfile
                  if (active_chat_with_id === actorId && active_chat_updated_at) {
                    const updatedAt = new Date(active_chat_updated_at).getTime()
                    const now = Date.now()
                    if (now - updatedAt < 45000) {
                      isActivelyInChat = true
                      console.log(`Skip push: recipient ${receiverId} is actively in chat with sender ${actorId}`)
                    }
                  }
                }
              } catch (err) {
                console.error("Error checking recipient chat presence:", err)
              }

              if (!isActivelyInChat) {
                recipientIds.push(receiverId)
              }
            }
          } catch (err) {
            console.error("Error checking chat mute:", err)
            // Fallback: send notification if query fails
            recipientIds.push(receiverId)
          }
        }
      }
    } else if (table === 'notifications' && type === 'INSERT') {
      const receiverId = record.user_id
      if (receiverId) {
        recipientIds.push(receiverId)
      }
      actorId = record.actor_id
      notifType = record.type // 'like', 'comment', 'friend_request', etc.
    }

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "No active or unmuted recipients" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Fetch actor nickname if we have an actorId
    let nickname: string | null = null
    if (actorId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', actorId)
        .single()
      nickname = profile?.nickname || null
    }

    // Build a localized title/message for every supported language. OneSignal delivers
    // the variant matching each subscription's language (set client-side to the SITE
    // language via OneSignal.User.setLanguage), falling back to "en".
    const headings: Record<string, string> = {}
    const contents: Record<string, string> = {}
    for (const lang of LANGS) {
      const { title, message } = buildText(TRANSLATIONS[lang], notifType!, record, nickname, groupName)
      headings[lang] = title
      contents[lang] = message
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: recipientIds,
        contents,
        headings
      })
    })

    const result = await response.json()
    console.log("OneSignal result:", result)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error in onesignal-notify:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
