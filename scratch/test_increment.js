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

async function testIncrement() {
  const paintingId = 'ba5afe79-0541-435e-8840-cd329ff6afa9'; // Warsaw
  console.log(`Calling increment_painting_views RPC for painting: ${paintingId}`);
  const { data, error } = await supabase.rpc('increment_painting_views', { target_painting_id: paintingId });
  if (error) {
    console.error("RPC call failed:", error);
  } else {
    console.log("RPC call success!");
    
    // Now check if a view row was created
    const { data: views, error: viewsError } = await supabase
      .from('painting_views')
      .select('*')
      .eq('painting_id', paintingId);
    
    if (viewsError) {
      console.error("Error fetching views:", viewsError);
    } else {
      console.log(`Found ${views.length} views in painting_views table:`, views);
    }
  }
}

testIncrement();
