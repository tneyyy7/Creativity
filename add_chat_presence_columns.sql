-- Alter profiles table to add columns for tracking active chat presence
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS active_chat_with_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_chat_updated_at timestamptz;

-- Add indexes to ensure fast queries
CREATE INDEX IF NOT EXISTS profiles_active_chat_with_id_idx ON public.profiles(active_chat_with_id);
