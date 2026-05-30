import { supabase } from './supabase'

/**
 * Initiates the Stripe Checkout process by calling the create_stripe_checkout edge function.
 * @param {string} priceId - The Stripe Price ID for the selected subscription plan.
 * @param {string} userId - The current user's UUID.
 */
export async function redirectToStripeCheckout(priceId, userId) {
  try {
    const { data, error } = await supabase.functions.invoke('create_stripe_checkout', {
      body: { priceId, userId }
    })

    if (error) throw error
    if (!data?.url) throw new Error('No checkout URL returned')

    // Redirect user to Stripe Checkout
    window.location.href = data.url
  } catch (err) {
    console.error('Error redirecting to Stripe Checkout:', err)
    throw err
  }
}
