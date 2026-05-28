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

console.log("Supabase URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  console.log("Querying profiles table for tney...");
  const { data, error } = await supabase.from('profiles').select('id, nickname, is_verified').ilike('nickname', '%tney%');
  if (error) {
    console.error("profiles check failed:", error);
  } else {
    console.log("Profiles matching tney:", data);
  }
}

checkTable();
