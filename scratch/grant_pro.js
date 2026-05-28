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

async function grantPro() {
  // 1. Get all profiles to see who is available
  const { data: profiles, error: pError } = await supabase.from('profiles').select('id, nickname');
  if (pError) {
    console.error("Error fetching profiles:", pError);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log("No profiles found in the database. Please sign up in the app first.");
    return;
  }

  console.log("Found profiles:", profiles);

  // 2. Grant Pro subscription to all profiles (or you can specify one)
  for (const profile of profiles) {
    console.log(`Granting Pro to user: ${profile.nickname} (${profile.id})...`);
    
    const { data, error } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: profile.id,
        plan: 'pro_yearly',
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select();

    if (error) {
      console.error(`Error granting Pro to ${profile.nickname}:`, error);
    } else {
      console.log(`Successfully granted Pro! Sub row:`, data);
    }
  }
}

grantPro();
