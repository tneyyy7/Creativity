import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const CLIENT_URL = Deno.env.get('CLIENT_URL') || 'http://localhost:5173'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
// Allowlist of the Pro price IDs we actually sell. Without this, a client could
// pass any active recurring price from our Stripe account (e.g. a $1 test price)
// and still be mapped to Pro by the webhook. Comma-separated env var.
const ALLOWED_PRICE_IDS = (Deno.env.get('STRIPE_ALLOWED_PRICE_IDS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY is not configured" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Derive the user from the verified JWT — never trust a userId from the body,
    // otherwise a caller could attribute a checkout to someone else.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    const userId = caller.id

    const { priceId } = await req.json()
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Missing priceId" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Only allow the Pro prices we actually sell. If the allowlist is unset we
    // fail closed rather than accept arbitrary price IDs.
    if (ALLOWED_PRICE_IDS.length === 0 || !ALLOWED_PRICE_IDS.includes(priceId)) {
      console.error(`Rejected priceId ${priceId} (allowlist size ${ALLOWED_PRICE_IDS.length})`)
      return new Response(JSON.stringify({ error: "Invalid price" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const origin = req.headers.get('origin') || CLIENT_URL

    // Create a Checkout Session
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/subscription?success=true`,
        cancel_url: `${origin}/subscription?cancelled=true`,
        "metadata[user_id]": userId,
        "subscription_data[metadata][user_id]": userId,
      }),
    })

    const session = await response.json()
    if (!response.ok) {
      console.error("Stripe error:", session)
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe Checkout session creation failed" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
