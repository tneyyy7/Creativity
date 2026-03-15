import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]

const supabase = createClient(url, key)

async function checkFriendships() {
  const { count, error } = await supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
  
  if (error) {
    console.error('Friendships error:', error.message)
  } else {
    console.log('Total friendships in table:', count)
  }

  const { data: { user } } = await supabase.auth.signInWithPassword({
    email: 'zbovsunovsky@gmail.com',
    password: 'password_placeholder'
  }).catch(() => ({ data: { user: null } }))

  if (user) {
    console.log('Logged in as:', user.id)
    const { data: myFriends, error: myError } = await supabase
      .from('friendships')
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    
    console.log('My friendships:', myFriends)
  } else {
    console.log('Could not log in as user, but checking public view...')
  }
}

checkFriendships()
