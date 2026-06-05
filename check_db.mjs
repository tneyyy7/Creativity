import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`${key}=(.*)`))
  return match ? match[1] : null
}

const supabaseUrl = getEnv('VITE_SUPABASE_URL')
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY')

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: p, error: pe } = await supabase.from('profiles').select('*').limit(1)
  console.log('Profiles error:', pe?.message || 'none')
  console.log('Profiles cols:', p && p.length ? Object.keys(p[0]) : 'no data')

  const { data: pt, error: pte } = await supabase.from('paintings').select('*').limit(1)
  console.log('Paintings error:', pte?.message || 'none')
  console.log('Paintings cols:', pt && pt.length ? Object.keys(pt[0]) : 'no data')
}
run()
