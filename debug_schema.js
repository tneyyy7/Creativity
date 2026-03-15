import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Manual parsing of .env since dotenv is missing
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]

const supabase = createClient(url, key)

async function debugSchema() {
  console.log('--- DB SCHEMA DEBUG ---')
  const { data: pData, error: pError } = await supabase.from('paintings').select('*').limit(1)
  if (pError) console.error('Paintings error:', pError.message)
  else console.log('Paintings columns:', Object.keys(pData[0] || {}))

  const { data: fData, error: fError } = await supabase.from('friendships').select('*').limit(1)
  if (fError) console.error('Friendships error:', fError.message)
  else console.log('Friendships columns:', Object.keys(fData[0] || {}))

  const { data: profData, error: profError } = await supabase.from('profiles').select('*').limit(1)
  if (profError) console.error('Profiles error:', profError.message)
  else console.log('Profiles columns:', Object.keys(profData[0] || {}))
}

debugSchema()
