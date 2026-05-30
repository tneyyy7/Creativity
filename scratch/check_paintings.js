import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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

async function checkPaintings() {
  console.log("Fetching all paintings from database...");
  const { data, error } = await supabase
    .from('paintings')
    .select('id, title, user_id, is_finished, views_count, likes_count');
  
  if (error) {
    console.error("Error fetching paintings:", error);
  } else {
    console.log(`Found ${data.length} paintings:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

checkPaintings();
