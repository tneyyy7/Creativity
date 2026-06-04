-- 💳 ADD STRIPE COLUMNS TO SUBSCRIPTIONS TABLE
-- Run this SQL in your Supabase SQL Editor to add Stripe support to subscriptions.

ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
ADD COLUMN IF NOT EXISTS stripe_customer_id text;
