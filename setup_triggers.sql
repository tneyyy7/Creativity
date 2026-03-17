-- 1. Enable the HTTP extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

-- 2. Create the trigger function to call our Edge Function
CREATE OR REPLACE FUNCTION public.handle_onesignal_notification()
RETURNS TRIGGER AS $$
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Set up triggers for different tables

-- For Messages
DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_onesignal_notification();

-- For Likes and Comments (via the notifications table)
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;
CREATE TRIGGER on_notification_created
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_onesignal_notification();
