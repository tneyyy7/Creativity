-- 💎 CREATIVITY PRO SUBSCRIPTIONS & CUSTOM EMOJIS MIGRATIONS
-- Ultra-safe migrations with safeguards (IF NOT EXISTS, DO blocks) for Supabase

-- ==========================================
-- 1. Create Subscriptions Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',                  -- 'free', 'pro_monthly', 'pro_yearly'
  status text NOT NULL DEFAULT 'inactive',             -- 'active', 'cancelled', 'expired', 'inactive'
  lemon_squeezy_subscription_id text,
  lemon_squeezy_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Subscriptions
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to read own subscription" ON public.subscriptions;
  CREATE POLICY "Allow users to read own subscription" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to insert own subscription" ON public.subscriptions;
  CREATE POLICY "Allow users to insert own subscription" ON public.subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to update own subscription" ON public.subscriptions;
  CREATE POLICY "Allow users to update own subscription" ON public.subscriptions
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 2. Helper Function to Check Pro Status
-- ==========================================
CREATE OR REPLACE FUNCTION public.is_user_pro(user_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid AND (status = 'active' OR (status = 'cancelled' AND current_period_end > now()))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 3. Create Custom Emojis Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.custom_emojis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,                                  -- Shortcode name, e.g., 'cool_cat'
  image_url text NOT NULL,                             -- Square formatted image URL (128x128px)
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Custom Emojis
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read access to custom_emojis" ON public.custom_emojis;
  CREATE POLICY "Allow public read access to custom_emojis" ON public.custom_emojis
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow Pro users to insert own custom_emojis" ON public.custom_emojis;
  CREATE POLICY "Allow Pro users to insert own custom_emojis" ON public.custom_emojis
    FOR INSERT WITH CHECK (
      auth.uid() = user_id AND public.is_user_pro(auth.uid())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to delete own custom_emojis" ON public.custom_emojis;
  CREATE POLICY "Allow users to delete own custom_emojis" ON public.custom_emojis
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 4. Create Pro Profile Settings Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pro_profile_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  avatar_frame text DEFAULT 'default',                 -- 'default', 'gold', 'diamond', 'fire', 'rainbow', 'ice'
  nickname_color text,                                 -- HEX color string
  chat_theme text DEFAULT 'default',                  -- Chat background / bubble styling
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pro_profile_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Pro Profile Settings
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read access to pro_profile_settings" ON public.pro_profile_settings;
  CREATE POLICY "Allow public read access to pro_profile_settings" ON public.pro_profile_settings
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow Pro users to insert own pro_profile_settings" ON public.pro_profile_settings;
  CREATE POLICY "Allow Pro users to insert own pro_profile_settings" ON public.pro_profile_settings
    FOR INSERT WITH CHECK (
      auth.uid() = user_id AND public.is_user_pro(auth.uid())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow Pro users to update own pro_profile_settings" ON public.pro_profile_settings;
  CREATE POLICY "Allow Pro users to update own pro_profile_settings" ON public.pro_profile_settings
    FOR UPDATE USING (
      auth.uid() = user_id AND public.is_user_pro(auth.uid())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 5. Create User Chat Themes Table (Per-Friend)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.user_chat_themes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  theme text NOT NULL DEFAULT 'default',             -- 'default', 'dark_space', 'cyberpunk', 'rose_gold', 'sunset_glow'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

-- Enable RLS
ALTER TABLE public.user_chat_themes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for User Chat Themes
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to read own chat themes" ON public.user_chat_themes;
  CREATE POLICY "Allow users to read own chat themes" ON public.user_chat_themes
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow Pro users to insert own chat themes" ON public.user_chat_themes;
  CREATE POLICY "Allow Pro users to insert own chat themes" ON public.user_chat_themes
    FOR INSERT WITH CHECK (
      auth.uid() = user_id AND public.is_user_pro(auth.uid())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow Pro users to update own chat themes" ON public.user_chat_themes;
  CREATE POLICY "Allow Pro users to update own chat themes" ON public.user_chat_themes
    FOR UPDATE USING (
      auth.uid() = user_id AND public.is_user_pro(auth.uid())
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
