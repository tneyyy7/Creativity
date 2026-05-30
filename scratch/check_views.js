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

async function checkViews() {
  console.log("Fetching all records from painting_views table...");
  const { data, error } = await supabase
    .from('painting_views')
    .select('*');
  
  if (error) {
    console.error("Error fetching painting_views:", error);
  } else {
    console.log(`Found ${data.length} records in painting_views:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

checkViews();
