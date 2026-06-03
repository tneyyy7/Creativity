import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envRaw = fs.readFileSync('./.env.local', 'utf-8')
let SUPABASE_URL = ''
let SUPABASE_ANON_KEY = ''
for (const line of envRaw.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) SUPABASE_URL = line.split('=')[1]
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) SUPABASE_ANON_KEY = line.split('=')[1]
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
async function run() {
  const { data, error } = await supabase.from('chat_mutes').select('*').limit(1)
  console.log('Data:', data)
  console.log('Error:', error)
}
run()
