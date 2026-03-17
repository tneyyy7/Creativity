import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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

    let receiverId = null
    let title = "Creativity"
    let message = ""
    let actorId = null

    if (table === 'messages' && type === 'INSERT') {
      receiverId = record.receiver_id
      actorId = record.sender_id
      title = "Новое сообщение"
      message = record.content
    } else if (table === 'notifications' && type === 'INSERT') {
      receiverId = record.user_id
      actorId = record.actor_id
      
      const notifType = record.type // 'like', 'comment', 'friend_request', etc.
      
      if (notifType === 'like') {
        title = "Новый лайк ❤️"
        message = "оценил(а) ваш рисунок"
      } else if (notifType === 'comment') {
        title = "Новый комментарий 💬"
        message = `прокомментировал(а) ваш рисунок: ${record.content || ''}`
      } else if (notifType === 'friend_request') {
        title = "Запрос в друзья 👋"
        message = "хочет добавить вас в друзья"
      } else {
        message = record.content || "У вас новое уведомление"
      }
    }

    if (!receiverId) {
      return new Response(JSON.stringify({ skipped: true, reason: "No receiverId" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Fetch actor nickname if we have an actorId
    if (actorId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', actorId)
        .single()
      
      if (profile?.nickname) {
        if (table === 'messages') {
          title = `Сообщение от ${profile.nickname}`
        } else {
          message = `${profile.nickname} ${message}`
        }
      }
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [receiverId],
        contents: { "en": message, "ru": message },
        headings: { "en": title, "ru": title }
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
