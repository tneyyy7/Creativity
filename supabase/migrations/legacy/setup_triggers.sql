-- 1. Enable the pg_net extension (required for net.http_post)
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- 2. Create the trigger function to call our Edge Function (with exception handling to prevent rollback)
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
