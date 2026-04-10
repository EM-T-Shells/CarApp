import type { Session } from '@supabase/supabase-js'

// ── Mocks ──────────────────────────────────────────────────────────────

const mockSignInWithOAuth = jest.fn()
const mockSignInWithOtp = jest.fn()
const mockVerifyOtp = jest.fn()
const mockSignOut = jest.fn()
const mockGetUser = jest.fn()
const mockSetSession = jest.fn()
const mockFrom = jest.fn()

jest.mock('../client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
      setSession: (...args: unknown[]) => mockSetSession(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}))

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://redirect'),
}))

import * as WebBrowser from 'expo-web-browser'
import {
  signInWithGoogle,
  signInWithApple,
  signInWithOtp as signInWithOtpFn,
  verifyOtp,
  signOut,
  isNewUser,
} from '../auth'

const mockSession: Session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: {
    id: 'user-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ── OAuth Tests ────────────────────────────────────────────────────────

describe('signInWithGoogle', () => {
  it('returns session on successful OAuth flow', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/auth' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: `exp://redirect#access_token=access-token&refresh_token=refresh-token`,
    })
    mockSetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const result = await signInWithGoogle()

    expect(result.data).toEqual(mockSession)
    expect(result.error).toBeNull()
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'exp://redirect', skipBrowserRedirect: true },
    })
  })

  it('returns error when OAuth URL fails', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error('Provider disabled'),
    })

    const result = await signInWithGoogle()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Provider disabled')
  })

  it('returns error when user cancels browser', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/auth' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'cancel',
    })

    const result = await signInWithGoogle()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Auth session cancelled')
  })

  it('returns error when callback URL has no tokens', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://accounts.google.com/auth' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'exp://redirect#error=access_denied',
    })

    const result = await signInWithGoogle()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Missing tokens in callback URL')
  })
})

describe('signInWithApple', () => {
  it('calls OAuth with apple provider', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: 'https://appleid.apple.com/auth' },
      error: null,
    })
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: `exp://redirect#access_token=at&refresh_token=rt`,
    })
    mockSetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    await signInWithApple()

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'apple' }),
    )
  })
})

// ── OTP Tests ──────────────────────────────────────────────────────────

describe('signInWithOtp', () => {
  it('sends OTP to email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const result = await signInWithOtpFn({ email: 'test@example.com' })

    expect(result.data).toEqual({ method: 'email' })
    expect(result.error).toBeNull()
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ email: 'test@example.com' })
  })

  it('sends OTP to phone', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const result = await signInWithOtpFn({ phone: '+15551234567' })

    expect(result.data).toEqual({ method: 'phone' })
    expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+15551234567' })
  })

  it('returns error on failure', async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: new Error('Rate limit exceeded'),
    })

    const result = await signInWithOtpFn({ email: 'test@example.com' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Rate limit exceeded')
  })
})

describe('verifyOtp', () => {
  it('verifies email OTP and returns session', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const result = await verifyOtp({ email: 'test@example.com' }, '123456')

    expect(result.data).toEqual(mockSession)
    expect(result.error).toBeNull()
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '123456',
      type: 'email',
    })
  })

  it('verifies phone OTP with sms type', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    await verifyOtp({ phone: '+15551234567' }, '123456')

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      phone: '+15551234567',
      token: '123456',
      type: 'sms',
    })
  })

  it('returns error when verification fails', async () => {
    mockVerifyOtp.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid OTP'),
    })

    const result = await verifyOtp({ email: 'test@example.com' }, 'wrong')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Invalid OTP')
  })
})

// ── Sign Out Tests ─────────────────────────────────────────────────────

describe('signOut', () => {
  it('signs out successfully', async () => {
    mockSignOut.mockResolvedValue({ error: null })

    const result = await signOut()

    expect(result.data).toBe(true)
    expect(result.error).toBeNull()
  })

  it('returns error on failure', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Network error') })

    const result = await signOut()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Network error')
  })
})

// ── isNewUser Tests ────────────────────────────────────────────────────

describe('isNewUser', () => {
  const mockSelect = jest.fn()
  const mockEq = jest.fn()
  const mockMaybeSingle = jest.fn()

  beforeEach(() => {
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
  })

  it('returns true when no users row exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await isNewUser()

    expect(result.data).toBe(true)
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('users')
  })

  it('returns false when users row exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'user-123' },
      error: null,
    })

    const result = await isNewUser()

    expect(result.data).toBe(false)
  })

  it('returns error when no authenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const result = await isNewUser()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('No authenticated user')
  })

  it('returns error when query fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: new Error('DB error'),
    })

    const result = await isNewUser()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('DB error')
  })
})
