import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const CLIENT_URL = Deno.env.get('CLIENT_URL') || 'http://localhost:5173'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { priceId, userId } = await req.json()

    if (!priceId || !userId) {
      return new Response(JSON.stringify({ error: "Missing priceId or userId" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY is not configured" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

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
        success_url: `${CLIENT_URL}/subscription?success=true`,
        cancel_url: `${CLIENT_URL}/subscription?cancelled=true`,
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
