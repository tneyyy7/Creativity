-- 🎨 ULTRA-SAFE MIGRATIONS FOR CREATIVITY WAVES 1 & 2 FEATURES
-- This script uses pgSQL safeguards (DO blocks, IF NOT EXISTS) to ensure error-free execution in Supabase.

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

-- RLS Policies for tags
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read access to tags" ON public.tags;
  CREATE POLICY "Allow public read access to tags" ON public.tags
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow authenticated users to insert tags" ON public.tags;
  CREATE POLICY "Allow authenticated users to insert tags" ON public.tags
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 3. Painting Tags Table (Wave 1 #2 Join Table)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.painting_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Safely add UNIQUE constraint to painting_tags
DO $$
BEGIN
  ALTER TABLE public.painting_tags ADD CONSTRAINT painting_tags_painting_id_tag_id_key UNIQUE (painting_id, tag_id);
EXCEPTION WHEN OTHERS THEN
  -- Ignore if constraint already exists
  NULL;
END $$;

-- Enable RLS
ALTER TABLE public.painting_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for painting_tags
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read access to painting_tags" ON public.painting_tags;
  CREATE POLICY "Allow public read access to painting_tags" ON public.painting_tags
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to insert painting_tags for their paintings" ON public.painting_tags;
  CREATE POLICY "Allow users to insert painting_tags for their paintings" ON public.painting_tags
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.paintings
        WHERE id = painting_id AND user_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to delete painting_tags for their paintings" ON public.painting_tags;
  CREATE POLICY "Allow users to delete painting_tags for their paintings" ON public.painting_tags
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.paintings
        WHERE id = painting_id AND user_id = auth.uid()
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 4. Bookmarks Table (Wave 1 #3)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  painting_id uuid REFERENCES public.paintings(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Safely add UNIQUE constraint to bookmarks
DO $$
BEGIN
  ALTER TABLE public.bookmarks ADD CONSTRAINT bookmarks_user_id_painting_id_key UNIQUE (user_id, painting_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Enable RLS
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookmarks
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to select their own bookmarks" ON public.bookmarks;
  CREATE POLICY "Allow users to select their own bookmarks" ON public.bookmarks
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to insert their own bookmarks" ON public.bookmarks;
  CREATE POLICY "Allow users to insert their own bookmarks" ON public.bookmarks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to delete their own bookmarks" ON public.bookmarks;
  CREATE POLICY "Allow users to delete their own bookmarks" ON public.bookmarks
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==========================================
-- 5. Follows Table (Wave 2 #9)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Safely add constraints to follows
DO $$
BEGIN
  ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_following_id_key UNIQUE (follower_id, following_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.follows ADD CONSTRAINT no_self_follow CHECK (follower_id <> following_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for follows
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow public read access to follows" ON public.follows;
  CREATE POLICY "Allow public read access to follows" ON public.follows
    FOR SELECT USING (true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to follow others" ON public.follows;
  CREATE POLICY "Allow users to follow others" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow users to unfollow others" ON public.follows;
  CREATE POLICY "Allow users to unfollow others" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ==========================================
-- 6. Notification Center DB Triggers
-- ==========================================

-- Предотвращаем дублирование: принудительно удаляем все триггеры с любыми именами
DROP TRIGGER IF EXISTS on_like_created ON public.post_likes;
DROP TRIGGER IF EXISTS on_like_deleted ON public.post_likes;
DROP TRIGGER IF EXISTS like_trigger ON public.post_likes;
DROP TRIGGER IF EXISTS like_notification_trigger ON public.post_likes;

DROP TRIGGER IF EXISTS on_comment_created ON public.post_comments;
DROP TRIGGER IF EXISTS comment_trigger ON public.post_comments;
DROP TRIGGER IF EXISTS comment_notification_trigger ON public.post_comments;

DROP TRIGGER IF EXISTS on_bookmark_created ON public.bookmarks;
DROP TRIGGER IF EXISTS on_bookmark_deleted ON public.bookmarks;
DROP TRIGGER IF EXISTS bookmark_trigger ON public.bookmarks;
DROP TRIGGER IF EXISTS bookmark_notification_trigger ON public.bookmarks;

DROP TRIGGER IF EXISTS on_follow_created ON public.follows;
DROP TRIGGER IF EXISTS on_follow_deleted ON public.follows;
DROP TRIGGER IF EXISTS follow_trigger ON public.follows;
DROP TRIGGER IF EXISTS follow_notification_trigger ON public.follows;

DROP TRIGGER IF EXISTS on_friendship_modified ON public.friendships;
DROP TRIGGER IF EXISTS friendship_trigger ON public.friendships;


-- A. Like Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_like_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = NEW.painting_id;
  IF target_user_id IS NOT NULL AND target_user_id <> NEW.user_id THEN
    -- Защита от дублирования
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications 
      WHERE user_id = target_user_id AND actor_id = NEW.user_id AND painting_id = NEW.painting_id AND type = 'like'
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, painting_id, type, is_read, created_at)
      VALUES (target_user_id, NEW.user_id, NEW.painting_id, 'like', false, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE TRIGGER on_like_deleted
  AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_deletion_notification();


-- B. Comment Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = NEW.painting_id;
  IF target_user_id IS NOT NULL AND target_user_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, painting_id, type, content, is_read, created_at)
    VALUES (target_user_id, NEW.user_id, NEW.painting_id, 'comment', substring(NEW.content from 1 for 100), false, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_notification();


-- C. Friendship Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_friendship_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications 
      WHERE user_id = NEW.receiver_id AND actor_id = NEW.sender_id AND type = 'friend_request'
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, type, is_read, created_at)
      VALUES (NEW.receiver_id, NEW.sender_id, 'friend_request', false, now());
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted') THEN
    DELETE FROM public.notifications 
    WHERE user_id = NEW.receiver_id AND actor_id = NEW.sender_id AND type = 'friend_request';
    
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications 
      WHERE user_id = NEW.sender_id AND actor_id = NEW.receiver_id AND type = 'friend_accept'
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, type, is_read, created_at)
      VALUES (NEW.sender_id, NEW.receiver_id, 'friend_accept', false, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friendship_modified
  AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_friendship_notification();


-- D. Bookmark Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_bookmark_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = NEW.painting_id;
  IF target_user_id IS NOT NULL AND target_user_id <> NEW.user_id THEN
    -- Защита от дублирования
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications 
      WHERE user_id = target_user_id AND actor_id = NEW.user_id AND painting_id = NEW.painting_id AND type = 'bookmark'
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, painting_id, type, is_read, created_at)
      VALUES (target_user_id, NEW.user_id, NEW.painting_id, 'bookmark', false, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_bookmark_created
  AFTER INSERT ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.handle_bookmark_notification();

-- Delete notification when bookmark is deleted
CREATE OR REPLACE FUNCTION public.handle_bookmark_deletion_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id FROM public.paintings WHERE id = OLD.painting_id;
  IF target_user_id IS NOT NULL THEN
    DELETE FROM public.notifications 
    WHERE user_id = target_user_id AND actor_id = OLD.user_id AND painting_id = OLD.painting_id AND type = 'bookmark';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_bookmark_deleted
  AFTER DELETE ON public.bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.handle_bookmark_deletion_notification();


-- E. Follow Notifications Trigger Function
CREATE OR REPLACE FUNCTION public.handle_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify the followed user about their new follower
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications 
    WHERE user_id = NEW.following_id AND actor_id = NEW.follower_id AND type = 'follow'
  ) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, is_read, created_at)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', false, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_created
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_notification();

-- Delete notification when follow is deleted (unfollowed)
CREATE OR REPLACE FUNCTION public.handle_follow_deletion_notification()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.notifications 
  WHERE user_id = OLD.following_id AND actor_id = OLD.follower_id AND type = 'follow';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_deleted
  AFTER DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_deletion_notification();


-- ==========================================
-- F. Fault-Tolerant Push Notifications trigger (OneSignal call safety)
-- ==========================================

-- Create the trigger function to call our Edge Function (with exception handling to prevent rollback)
CREATE OR REPLACE FUNCTION public.handle_onesignal_notification()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM
      net.http_post(
        url := 'https://mutrphgzoczcitnmpxsm.supabase.co/functions/v1/onesignal-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'record', row_to_json(NEW),
          'table', TG_TABLE_NAME,
          'type', TG_OP,
          'schema', TG_TABLE_SCHEMA
        )
      );
  EXCEPTION WHEN OTHERS THEN
    -- Prevent transaction rollbacks on network/HTTP failures
    RAISE WARNING 'OneSignal Push Notification HTTP failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
