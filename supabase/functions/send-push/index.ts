import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { ApplicationServer, importVapidKeys } from "jsr:@negrel/webpush@0.5.0";
import { decodeBase64Url, encodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const pubBase64 = Deno.env.get("VAPID_PUBLIC_KEY");
    const privBase64 = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!pubBase64 || !privBase64 || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    console.log("Decoding VAPID keys using Deno std/encoding...");

    const pubBytes = decodeBase64Url(pubBase64);
    const privBytes = decodeBase64Url(privBase64);

    console.log(`Public key length: ${pubBytes.length} bytes`);
    console.log(`Private key length: ${privBytes.length} bytes`);

    if (pubBytes.length !== 65) {
      throw new Error(`Invalid Public Key length: expected 65, got ${pubBytes.length}`);
    }
    if (privBytes.length !== 32) {
      throw new Error(`Invalid Private Key length: expected 32, got ${privBytes.length}`);
    }

    // Prepare JWK coordinates
    const x = encodeBase64Url(pubBytes.slice(1, 33));
    const y = encodeBase64Url(pubBytes.slice(33, 65));
    const d = encodeBase64Url(privBytes);

    const jwk = {
      publicKey: { kty: "EC", crv: "P-256", x, y, ext: true },
      privateKey: { kty: "EC", crv: "P-256", x, y, d, ext: true }
    };

    // @ts-ignore: Library type definitions might be tricky in Edge Functions
    const vapidKeys = await importVapidKeys(jwk);
    const appServer = await ApplicationServer.new({
      vapidKeys,
      contactInformation: `mailto:admin@${new URL(supabaseUrl).hostname}`
    });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const receiverId = body.test_user_id || body.record?.receiver_id;

    if (!receiverId) throw new Error("Missing receiverId");

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', receiverId);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No active subscriptions found for user: ${receiverId}`);
      return new Response(JSON.stringify({ error: "No active subscriptions" }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const results = await Promise.all(subscriptions.map(async (sub) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh
          }
        });

        const payload = JSON.stringify({
          title: body.test_user_id ? "✅ Notification Fixed!" : "New Message",
          body: body.test_user_id ? "Push notifications are now working with correct encryption." : (body.record?.content || "Click to open"),
          url: "/messages"
        });

        // Fixed: Providing explicit options to avoid "urgency" of undefined error
        // Or newer version of library might handle empty options better
        const resp = await subscriber.pushMessage(new TextEncoder().encode(payload), {
          urgency: "normal",
          ttl: 60 * 60 * 24 // 1 day
        });
        
        return { status: "success", code: resp.status };
      } catch (err) {
        console.error("Delivery error inside map:", err.message);
        return { status: "error", message: err.message };
      }
    }));

    return new Response(JSON.stringify({ success: true, results }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200 
    });

  } catch (error) {
    console.error("Edge Function Failure:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200 
    });
  }
});
