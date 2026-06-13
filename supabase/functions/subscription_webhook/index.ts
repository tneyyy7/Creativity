import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LEMON_SQUEEZY_WEBHOOK_SECRET = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

// Convert Hex string to Uint8Array for HMAC verification
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

// Verify Lemon Squeezy signature
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyBuf = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify", "sign"]
  )
  const bodyBuf = encoder.encode(body)
  const signatureBuf = hexToBytes(signature)
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuf,
    bodyBuf
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-signature')

    // FAIL-CLOSED signature verification. Previously the check was skipped entirely
    // when the secret env var was unset, which let anyone POST a forged
    // subscription event and self-grant Pro. We now refuse to process the webhook
    // unless BOTH the secret is configured AND a valid signature is present.
    // NOTE: Lemon Squeezy is deprecated — billing moved fully to Stripe. This
    // function should be removed from deploy entirely:
    //   supabase functions delete subscription_webhook
    // Until then it stays locked shut.
    if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
      console.error("LEMON_SQUEEZY_WEBHOOK_SECRET not configured — refusing to process (fail-closed).")
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      })
    }
    if (!signature) {
      console.warn("Missing x-signature header")
      return new Response(JSON.stringify({ error: "Missing signature header" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    const isValid = await verifySignature(rawBody, signature, LEMON_SQUEEZY_WEBHOOK_SECRET)
    if (!isValid) {
      console.error("Invalid Lemon Squeezy signature")
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const payload = JSON.parse(rawBody)
    const eventName = payload.meta?.event_name
    const customData = payload.meta?.custom_data
    const userId = customData?.user_id

    console.log(`Received Lemon Squeezy event: ${eventName} for user: ${userId}`)

    if (!userId) {
      console.warn("No user_id found in custom_data, skipping.")
      return new Response(JSON.stringify({ skipped: true, reason: "No user_id in custom_data" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const data = payload.data
    if (data.type === 'subscriptions') {
      const subscriptionId = data.id
      const attributes = data.attributes
      const customerId = String(attributes.customer_id)
      const variantName = attributes.variant_name || ''
      const status = attributes.status // active, cancelled, expired, paused, on_trial, unpaid
      
      const currentPeriodStart = attributes.created_at
      // renews_at represents the next billing date, which is current_period_end
      const currentPeriodEnd = attributes.renews_at || attributes.ends_at

      // Determine plan name based on variant name
      const plan = variantName.toLowerCase().includes('year') || variantName.toLowerCase().includes('annual')
        ? 'pro_yearly'
        : 'pro_monthly'

      // Map status. In Lemon Squeezy, 'cancelled' means auto-renew is off, but the subscription is active until ends_at.
      // So if it is 'active' or 'cancelled' and has not expired, it is active in our system.
      let dbStatus = 'inactive'
      if (status === 'active') {
        dbStatus = 'active'
      } else if (status === 'cancelled') {
        const endsAt = attributes.ends_at ? new Date(attributes.ends_at) : null
        if (!endsAt || endsAt > new Date()) {
          dbStatus = 'active' // Still active until period ends
        } else {
          dbStatus = 'expired'
        }
      } else if (status === 'expired' || status === 'unpaid') {
        dbStatus = 'expired'
      }

      console.log(`Updating DB subscription: User=${userId}, Plan=${plan}, Status=${dbStatus}, LS_Id=${subscriptionId}`)

      // Upsert subscription state into database
      const { error } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          plan,
          status: dbStatus,
          lemon_squeezy_subscription_id: String(subscriptionId),
          lemon_squeezy_customer_id: customerId,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error("Database update error:", error)
        throw error
      }

      // Automatically initialize pro_profile_settings if the user is active Pro and settings don't exist
      if (dbStatus === 'active') {
        const { error: settingsError } = await supabase
          .from('pro_profile_settings')
          .upsert({
            user_id: userId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          })

        if (settingsError) {
          console.warn("Failed to auto-create pro_profile_settings:", settingsError)
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error processing LS webhook:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
