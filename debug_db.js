import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data: { user } } = await supabase.auth.signInWithPassword({
    email: 'zbovsunovsky@gmail.com', // From screenshot
    password: 'password_placeholder' // I don't know the password, but I can check public data
  }).catch(() => ({ data: { user: null } }))

  // Checking friendships for the user ID mentioned in screenshot if possible
  // Or just check all friendships to see status
  const { data: friendships, error: fError } = await supabase.from('friendships').select('*')
  console.log('Friendships:', friendships)

  const { data: profiles, error: pError } = await supabase.from('profiles').select('id, nickname')
  console.log('Profiles:', profiles)
  
  const { data: paintings, error: paError } = await supabase.from('paintings').select('id, user_id, is_finished')
  console.log('Paintings count:', paintings?.length)
  console.log('Finished paintings count:', paintings?.filter(p => p.is_finished)?.length)
}

check()
