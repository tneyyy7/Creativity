-- 🎨 MIGRATIONS FOR CREATIVITY WAVES 1 & 2 FEATURES

-- ==========================================
-- 1. Profiles Table Updates
-- ==========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- ==========================================
-- 2. Tags Table (Wave 1 #2)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone
DROP POLICY IF EXISTS "Allow public read access to tags" ON public.tags;
CREATE POLICY "Allow public read access to tags" ON public.tags
  FOR SELECT USING (true);

-- Allow authenticated users to insert tags
DROP POLICY IF EXISTS "Allow authenticated users to insert tags" ON public.tags;
CREATE POLICY "Allow authenticated users to insert tags" ON public.tags
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ==========================================
-- 3. Painting Tags Table (Wave 1 #2 Join Table)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.painting_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (painting_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.painting_tags ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone
DROP POLICY IF EXISTS "Allow public read access to painting_tags" ON public.painting_tags;
CREATE POLICY "Allow public read access to painting_tags" ON public.painting_tags
  FOR SELECT USING (true);

-- Allow authenticated users to manage tags for their own paintings
DROP POLICY IF EXISTS "Allow users to insert painting_tags for their paintings" ON public.painting_tags;
CREATE POLICY "Allow users to insert painting_tags for their paintings" ON public.painting_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.paintings
      WHERE id = painting_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Allow users to delete painting_tags for their paintings" ON public.painting_tags;
CREATE POLICY "Allow users to delete painting_tags for their paintings" ON public.painting_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.paintings
      WHERE id = painting_id AND user_id = auth.uid()
    )
  );

-- ==========================================
-- 4. Bookmarks Table (Wave 1 #3)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, painting_id)
);

-- Enable RLS
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own bookmarks
DROP POLICY IF EXISTS "Allow users to select their own bookmarks" ON public.bookmarks;
CREATE POLICY "Allow users to select their own bookmarks" ON public.bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own bookmarks" ON public.bookmarks;
CREATE POLICY "Allow users to insert their own bookmarks" ON public.bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own bookmarks" ON public.bookmarks;
CREATE POLICY "Allow users to delete their own bookmarks" ON public.bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- ==========================================
-- 5. Follows Table (Wave 2 #9)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Allow anyone to see follows
DROP POLICY IF EXISTS "Allow public read access to follows" ON public.follows;
CREATE POLICY "Allow public read access to follows" ON public.follows
  FOR SELECT USING (true);

-- Allow users to manage their own follows
DROP POLICY IF EXISTS "Allow users to follow others" ON public.follows;
CREATE POLICY "Allow users to follow others" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Allow users to unfollow others" ON public.follows;
CREATE POLICY "Allow users to unfollow others" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ==========================================
-- 6. Notification Center DB Triggers (Wave 1 #1)
-- ==========================================

-- A. Like Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get the owner of the painting
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = NEW.painting_id;
  
  -- Only notify if the person liking is not the owner of the painting
  IF target_user_id IS NOT NULL AND target_user_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, painting_id, type, is_read, created_at)
    VALUES (target_user_id, NEW.user_id, NEW.painting_id, 'like', false, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger for Like insertion
DROP TRIGGER IF EXISTS on_like_created ON public.post_likes;
CREATE TRIGGER on_like_created
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_notification();

-- Delete notification when post_like is deleted
CREATE OR REPLACE FUNCTION public.handle_like_deletion_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = OLD.painting_id;
  IF target_user_id IS NOT NULL THEN
    DELETE FROM public.notifications 
    WHERE user_id = target_user_id AND actor_id = OLD.user_id AND painting_id = OLD.painting_id AND type = 'like';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_like_deleted ON public.post_likes;
CREATE TRIGGER on_like_deleted
  AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_deletion_notification();


-- B. Comment Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Get the owner of the painting
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = NEW.painting_id;
  
  -- Only notify if the commenter is not the owner of the painting
  IF target_user_id IS NOT NULL AND target_user_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, painting_id, type, content, is_read, created_at)
    VALUES (target_user_id, NEW.user_id, NEW.painting_id, 'comment', substring(NEW.content from 1 for 100), false, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger for Comment insertion
DROP TRIGGER IF EXISTS on_comment_created ON public.post_comments;
CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_notification();


-- C. Friendship Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_friendship_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    INSERT INTO public.notifications (user_id, actor_id, type, is_read, created_at)
    VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', false, now());
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted') THEN
    -- Delete the pending request notification first
    DELETE FROM public.notifications 
    WHERE user_id = NEW.receiver_id AND actor_id = NEW.sender_id AND type = 'friend_request';
    
    -- Insert friendship_accepted notification to the sender
    INSERT INTO public.notifications (user_id, actor_id, type, is_read, created_at)
    VALUES (NEW.sender_id, NEW.receiver_id, 'friend_accept', false, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger for Friendship modified
DROP TRIGGER IF EXISTS on_friendship_modified ON public.friendships;
CREATE TRIGGER on_friendship_modified
  AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_friendship_notification();
