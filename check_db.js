import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log("Checking profiles...");
  const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, nickname, avatar_url');
  if (profileError) {
    console.error("Error fetching profiles:", profileError);
  } else {
    console.log("Profiles found:", profiles);
  }

  console.log("Checking friendships table existence...");
  const { data: friends, error: friendsError } = await supabase.from('friendships').select('*').limit(1);
  if (friendsError) {
    console.error("Error fetching friendships:", friendsError);
  } else {
    console.log("Friendships table is accessible. Rows:", friends.length);
  }
}

checkData();
