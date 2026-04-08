const mockCreateClient = jest.fn(() => ({ auth: {}, from: jest.fn() }))

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

describe('Supabase client', () => {
  beforeEach(() => {
    jest.resetModules()
    mockCreateClient.mockClear()
  })

  it('exports a supabase client instance', () => {
    const { supabase } = require('../client')
    expect(supabase).toBeDefined()
    expect(supabase).toHaveProperty('auth')
  })

  it('calls createClient with correct env vars', () => {
    require('../client')

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    const [url, key] = mockCreateClient.mock.calls[0]
    expect(url).toBe(process.env.EXPO_PUBLIC_SUPABASE_URL)
    expect(key).toBe(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
  })

  it('configures auth with SecureStore adapter and correct options', () => {
    require('../client')

    const options = mockCreateClient.mock.calls[0][2] as Record<string, unknown>
    const auth = options.auth as Record<string, unknown>

    expect(auth.storage).toBeDefined()
    expect(auth.autoRefreshToken).toBe(true)
    expect(auth.persistSession).toBe(true)
    expect(auth.detectSessionInUrl).toBe(false)
  })

  it('SecureStore adapter delegates to expo-secure-store', async () => {
    const SecureStore = require('expo-secure-store')
    require('../client')

    const options = mockCreateClient.mock.calls[0][2] as Record<string, unknown>
    const storage = (options.auth as Record<string, unknown>).storage as {
      getItem: (key: string) => Promise<string | null>
      setItem: (key: string, value: string) => Promise<void>
      removeItem: (key: string) => Promise<void>
    }

    await storage.getItem('test-key')
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('test-key')

    await storage.setItem('test-key', 'test-value')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('test-key', 'test-value')

    await storage.removeItem('test-key')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('test-key')
  })

  it('is a singleton (same reference on re-import)', () => {
    const { supabase: first } = require('../client')
    const { supabase: second } = require('../client')
    expect(first).toBe(second)
  })
})
