import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    })
  }

  try {
    const body = await req.text()
    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      console.error(`Webhook signature verification failed:`, err.message)
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      })
    }

    console.log(`Received Stripe event: ${event.type}`)

    const sessionOrSubscription = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const session = sessionOrSubscription;
      const userId = session.metadata?.user_id;
      const subscriptionId = session.subscription;
      const customerId = session.customer;

      if (!userId) {
        console.warn("No user_id found in session metadata")
        return new Response(JSON.stringify({ error: "No user_id in metadata" }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
      }

      // Fetch subscription details to get period start and end
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      const currentPeriodStart = new Date(subscription.current_period_start * 1000).toISOString();
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive';

      const plan = subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'pro_yearly' : 'pro_monthly';

      console.log(`Upserting active subscription for user: ${userId}`)
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        status,
        stripe_subscription_id: String(subscriptionId),
        stripe_customer_id: String(customerId),
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

      // Initialize pro profile settings
      await supabase.from('pro_profile_settings').upsert({
        user_id: userId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = sessionOrSubscription;
      const userId = subscription.metadata?.user_id;
      const subscriptionId = subscription.id;
      const customerId = subscription.customer;

      if (!userId) {
        console.warn("No user_id found in subscription metadata")
        return new Response(JSON.stringify({ error: "No user_id in metadata" }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        })
      }

      const currentPeriodStart = new Date(subscription.current_period_start * 1000).toISOString();
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      
      let status = 'inactive';
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        status = 'active';
      } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
        status = 'inactive';
      } else if (subscription.status === 'canceled') {
        status = 'expired';
      }

      const plan = subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'pro_yearly' : 'pro_monthly';

      console.log(`Updating subscription for user: ${userId} to status: ${status}`)
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        status,
        stripe_subscription_id: String(subscriptionId),
        stripe_customer_id: String(customerId),
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  } catch (error) {
    console.error("Error processing Stripe webhook:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
