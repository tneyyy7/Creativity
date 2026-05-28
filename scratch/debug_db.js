import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    env[parts[0].trim()] = parts[1].trim();
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("=== SUBSCRIPTIONS ===");
  const { data: subs, error: err1 } = await supabase.from('subscriptions').select('*');
  console.log("Error:", err1);
  console.log("Rows:", subs);

  console.log("=== PRO PROFILE SETTINGS ===");
  const { data: settings, error: err2 } = await supabase.from('pro_profile_settings').select('*');
  console.log("Error:", err2);
  console.log("Rows:", settings);

  console.log("=== CUSTOM EMOJIS ===");
  const { data: emojis, error: err3 } = await supabase.from('custom_emojis').select('*');
  console.log("Error:", err3);
  console.log("Rows:", emojis);
}

check();
