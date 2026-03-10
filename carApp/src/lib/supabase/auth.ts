import { supabase } from './client'

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  })
  if (error) throw error
}

export async function signInWithApple() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function isNewUser(uid: string) {
  const { data } = await supabase
    .from('users')
    .select('first_name')
    .eq('id', uid)
    .single()
  return !data?.first_name
}