import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID')
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')

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
    const { record, table, type, schema } = payload
    
    console.log(`Notification trigger for ${table} (${type})`)

    let receiverId = null
    let title = "Creativity"
    let message = ""
    let senderNickname = "Кто-то"

    if (table === 'messages' && type === 'INSERT') {
      receiverId = record.receiver_id
      title = "Новое сообщение"
      message = record.content
    } else if (table === 'post_likes' && type === 'INSERT') {
      // Find the owner of the painting
      // Note: Edge functions can query DB. Here we assuming payload might not have all info.
      // We'll need to fetch receiver_id (painting owner) in a real scenario if not in payload.
      // For now, let's assume the trigger sends enough info or we fetch it.
    } else if (table === 'post_comments' && type === 'INSERT') {
      // Similar to likes
    } else if (table === 'notifications' && type === 'INSERT') {
       // This table already aggregates likes/comments!
       receiverId = record.user_id
       title = "Creativity"
       message = record.content || "У вас новое уведомление"
    }

    if (!receiverId) {
      return new Response(JSON.stringify({ skipped: true, reason: "No receiverId" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
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
