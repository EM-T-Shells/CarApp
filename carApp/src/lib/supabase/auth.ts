import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from './client'
import type { Session } from '@supabase/supabase-js'

WebBrowser.maybeCompleteAuthSession()

const redirectUri = AuthSession.makeRedirectUri()

// ── Types ──────────────────────────────────────────────────────────────

type AuthResult<T> = { data: T; error: null } | { data: null; error: Error }

type OtpTarget =
  | { email: string; phone?: never }
  | { phone: string; email?: never }

// ── OAuth ──────────────────────────────────────────────────────────────

async function signInWithOAuth(
  provider: 'google' | 'apple',
): Promise<AuthResult<Session>> {
  try {
    const { data: oauthData, error: oauthError } =
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      })

    if (oauthError || !oauthData.url) {
      return { data: null, error: oauthError ?? new Error('No auth URL returned') }
    }

    const result = await WebBrowser.openAuthSessionAsync(
      oauthData.url,
      redirectUri,
    )

    if (result.type !== 'success') {
      return { data: null, error: new Error('Auth session cancelled') }
    }

    const url = new URL(result.url)

    // Supabase returns tokens in the URL fragment (#access_token=...&refresh_token=...)
    const params = new URLSearchParams(url.hash.substring(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      return { data: null, error: new Error('Missing tokens in callback URL') }
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

    if (sessionError || !sessionData.session) {
      return {
        data: null,
        error: sessionError ?? new Error('Failed to set session'),
      }
    }

    return { data: sessionData.session, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

export async function signInWithGoogle(): Promise<AuthResult<Session>> {
  return signInWithOAuth('google')
}

export async function signInWithApple(): Promise<AuthResult<Session>> {
  return signInWithOAuth('apple')
}

// ── OTP ────────────────────────────────────────────────────────────────

export async function signInWithOtp(
  target: OtpTarget,
): Promise<AuthResult<{ method: 'email' | 'phone' }>> {
  try {
    const { error } = await supabase.auth.signInWithOtp(
      target.email ? { email: target.email } : { phone: target.phone },
    )

    if (error) {
      return { data: null, error }
    }

    return {
      data: { method: target.email ? 'email' : 'phone' },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

export async function verifyOtp(
  target: OtpTarget,
  token: string,
): Promise<AuthResult<Session>> {
  try {
    const { data, error } = await supabase.auth.verifyOtp(
      target.email
        ? { email: target.email, token, type: 'email' }
        : { phone: target.phone, token, type: 'sms' },
    )

    if (error || !data.session) {
      return {
        data: null,
        error: error ?? new Error('No session returned after OTP verification'),
      }
    }

    return { data: data.session, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

// ── Sign Out ───────────────────────────────────────────────────────────

export async function signOut(): Promise<AuthResult<true>> {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return { data: null, error }
    }

    return { data: true, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

// ── New User Check ─────────────────────────────────────────────────────

export async function isNewUser(): Promise<AuthResult<boolean>> {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        data: null,
        error: authError ?? new Error('No authenticated user'),
      }
    }

    const { data, error: queryError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (queryError) {
      return { data: null, error: queryError }
    }

    return { data: data === null, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}
