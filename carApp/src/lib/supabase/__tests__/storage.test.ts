// ── Mocks ──────────────────────────────────────────────────────────────

const mockUpload = jest.fn()
const mockRemove = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockGetPublicUrl = jest.fn()

const mockStorageFrom = jest.fn(() => ({
  upload: mockUpload,
  remove: mockRemove,
  createSignedUrl: mockCreateSignedUrl,
  getPublicUrl: mockGetPublicUrl,
}))

jest.mock('../client', () => ({
  supabase: {
    storage: {
      from: (...args: unknown[]) => mockStorageFrom(...args),
    },
  },
}))

import {
  uploadFile,
  uploadAvatar,
  uploadBookingPhoto,
  uploadVettingDocument,
  getSignedUrl,
  getPublicUrl,
  deleteFiles,
} from '../storage'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://example.com/public/avatar.jpeg' },
  })
})

const fakeBlob = new Blob(['test'], { type: 'image/jpeg' })

// ── Validation ────────────────────────────────────────────────────────

describe('uploadFile — validation', () => {
  it('rejects unsupported mime types', async () => {
    const result = await uploadFile('avatars', fakeBlob, 'image/gif', 100, {
      userId: 'u1',
    })
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toContain('Unsupported file type')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects files exceeding 10MB', async () => {
    const result = await uploadFile(
      'avatars',
      fakeBlob,
      'image/jpeg',
      11 * 1024 * 1024,
      { userId: 'u1' },
    )
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toContain('maximum size')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('accepts image/jpeg, image/png, image/webp', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      const result = await uploadFile('avatars', fakeBlob, mime, 100, {
        userId: 'u1',
      })
      expect(result.error).toBeNull()
    }
  })
})

// ── Upload ────────────────────────────────────────────────────────────

describe('uploadFile', () => {
  it('uploads to avatars with upsert and returns publicUrl', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    const result = await uploadFile('avatars', fakeBlob, 'image/jpeg', 100, {
      userId: 'u1',
    })

    expect(result.error).toBeNull()
    expect(result.data!.path).toBe('u1.jpeg')
    expect(result.data!.publicUrl).toBe(
      'https://example.com/public/avatar.jpeg',
    )
    expect(mockUpload).toHaveBeenCalledWith('u1.jpeg', fakeBlob, {
      contentType: 'image/jpeg',
      upsert: true,
    })
  })

  it('uploads to booking-photos without upsert and returns null publicUrl', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    const result = await uploadFile(
      'booking-photos',
      fakeBlob,
      'image/png',
      100,
      { bookingId: 'b1', photoType: 'before' },
    )

    expect(result.error).toBeNull()
    expect(result.data!.path).toMatch(/^b1\/before_\d+\.png$/)
    expect(result.data!.publicUrl).toBeNull()
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^b1\/before_\d+\.png$/),
      fakeBlob,
      { contentType: 'image/png', upsert: false },
    )
  })

  it('returns error when Supabase upload fails', async () => {
    mockUpload.mockResolvedValue({
      data: null,
      error: new Error('Upload failed'),
    })

    const result = await uploadFile('avatars', fakeBlob, 'image/jpeg', 100, {
      userId: 'u1',
    })
    expect(result.data).toBeNull()
    expect(result.error!.message).toBe('Upload failed')
  })

  it('catches thrown exceptions', async () => {
    mockUpload.mockRejectedValue(new Error('Network error'))

    const result = await uploadFile('avatars', fakeBlob, 'image/jpeg', 100, {
      userId: 'u1',
    })
    expect(result.data).toBeNull()
    expect(result.error!.message).toBe('Network error')
  })
})

// ── Convenience wrappers ──────────────────────────────────────────────

describe('uploadAvatar', () => {
  it('returns the public URL on success', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    const result = await uploadAvatar('u1', fakeBlob, 'image/jpeg', 100)
    expect(result.error).toBeNull()
    expect(result.data).toBe('https://example.com/public/avatar.jpeg')
  })
})

describe('uploadBookingPhoto', () => {
  it('returns the storage path on success', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    const result = await uploadBookingPhoto(
      'b1',
      'after',
      fakeBlob,
      'image/webp',
      100,
    )
    expect(result.error).toBeNull()
    expect(result.data).toMatch(/^b1\/after_\d+\.webp$/)
  })
})

describe('uploadVettingDocument', () => {
  it('returns the storage path on success', async () => {
    mockUpload.mockResolvedValue({ data: {}, error: null })

    const result = await uploadVettingDocument(
      'u1',
      'insurance',
      fakeBlob,
      'image/jpeg',
      100,
    )
    expect(result.error).toBeNull()
    expect(result.data).toMatch(/^u1\/insurance_\d+\.jpeg$/)
  })
})

// ── Signed URL ────────────────────────────────────────────────────────

describe('getSignedUrl', () => {
  it('returns a signed URL on success', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/path' },
      error: null,
    })

    const result = await getSignedUrl('booking-photos', 'b1/before_123.jpeg')
    expect(result.error).toBeNull()
    expect(result.data).toBe('https://signed.example.com/path')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'b1/before_123.jpeg',
      3600,
    )
  })

  it('passes custom expiry', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/path' },
      error: null,
    })

    await getSignedUrl('vetting-documents', 'u1/doc.jpeg', 600)
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/doc.jpeg', 600)
  })

  it('returns error on failure', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: new Error('Not found'),
    })

    const result = await getSignedUrl('booking-photos', 'missing.jpeg')
    expect(result.data).toBeNull()
    expect(result.error!.message).toBe('Not found')
  })
})

// ── Public URL ────────────────────────────────────────────────────────

describe('getPublicUrl', () => {
  it('returns the public URL for a public bucket', () => {
    const result = getPublicUrl('avatars', 'u1.jpeg')
    expect(result.error).toBeNull()
    expect(result.data).toBe('https://example.com/public/avatar.jpeg')
  })

  it('returns error for a private bucket', () => {
    const result = getPublicUrl('booking-photos', 'b1/before.jpeg')
    expect(result.data).toBeNull()
    expect(result.error!.message).toContain('not public')
  })
})

// ── Delete ────────────────────────────────────────────────────────────

describe('deleteFiles', () => {
  it('deletes files and returns success', async () => {
    mockRemove.mockResolvedValue({ data: [], error: null })

    const result = await deleteFiles('booking-photos', [
      'b1/before_123.jpeg',
      'b1/after_456.jpeg',
    ])
    expect(result.error).toBeNull()
    expect(result.data).toBe(true)
    expect(mockRemove).toHaveBeenCalledWith([
      'b1/before_123.jpeg',
      'b1/after_456.jpeg',
    ])
  })

  it('returns error on failure', async () => {
    mockRemove.mockResolvedValue({
      data: null,
      error: new Error('Permission denied'),
    })

    const result = await deleteFiles('avatars', ['u1.jpeg'])
    expect(result.data).toBeNull()
    expect(result.error!.message).toBe('Permission denied')
  })
})
