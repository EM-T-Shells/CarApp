import { supabase } from './client'

// ── Types ─────────────────────────────────────────────────────────────

export type StorageBucket = 'avatars' | 'booking-photos' | 'vetting-documents'

export type StorageResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error }

export type UploadResult = StorageResult<{ path: string; publicUrl: string | null }>
export type DeleteResult = StorageResult<true>
export type UrlResult = StorageResult<string>

// ── Constants ─────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number]

/** Buckets that allow public URL access. */
const PUBLIC_BUCKETS: ReadonlySet<StorageBucket> = new Set(['avatars'])

// ── Helpers ───────────────────────────────────────────────────────────

function unknownError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

function isAcceptedMimeType(mime: string): mime is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mime)
}

/**
 * Build a unique storage path.
 *
 * Convention:
 *   avatars           → `{userId}.{ext}`
 *   booking-photos    → `{bookingId}/{photoType}_{timestamp}.{ext}`
 *   vetting-documents → `{userId}/{docLabel}_{timestamp}.{ext}`
 */
function buildPath(
  bucket: StorageBucket,
  opts: {
    userId?: string
    bookingId?: string
    photoType?: 'before' | 'after'
    docLabel?: string
    mimeType: AcceptedMimeType
  },
): string {
  const ext = opts.mimeType.split('/')[1] // jpeg | png | webp
  const ts = Date.now()

  switch (bucket) {
    case 'avatars':
      return `${opts.userId}.${ext}`
    case 'booking-photos':
      return `${opts.bookingId}/${opts.photoType}_${ts}.${ext}`
    case 'vetting-documents':
      return `${opts.userId}/${opts.docLabel ?? 'doc'}_${ts}.${ext}`
  }
}

// ── Validation ────────────────────────────────────────────────────────

function validateFile(
  fileSize: number,
  mimeType: string,
): StorageResult<AcceptedMimeType> {
  if (!isAcceptedMimeType(mimeType)) {
    return {
      data: null,
      error: new Error(
        `Unsupported file type "${mimeType}". Accepted: ${ACCEPTED_MIME_TYPES.join(', ')}`,
      ),
    }
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      data: null,
      error: new Error(
        `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
      ),
    }
  }
  return { data: mimeType, error: null }
}

// ── Upload ────────────────────────────────────────────────────────────

/**
 * Upload a file to a Supabase Storage bucket.
 *
 * The caller is responsible for client-side image compression (max 1920px
 * longest side, 80% quality) before passing the file blob/arraybuffer here.
 *
 * @param bucket   Target storage bucket
 * @param file     File contents (Blob, ArrayBuffer, or File)
 * @param mimeType MIME type of the file
 * @param fileSize Size in bytes (used for validation)
 * @param opts     Path-building options (userId, bookingId, etc.)
 */
export async function uploadFile(
  bucket: StorageBucket,
  file: Blob | ArrayBuffer | File,
  mimeType: string,
  fileSize: number,
  opts: {
    userId?: string
    bookingId?: string
    photoType?: 'before' | 'after'
    docLabel?: string
  },
): Promise<UploadResult> {
  const validation = validateFile(fileSize, mimeType)
  if (validation.error) return { data: null, error: validation.error }

  const validMime = validation.data
  const path = buildPath(bucket, { ...opts, mimeType: validMime })

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: validMime,
        upsert: bucket === 'avatars', // avatars are replaced in-place
      })

    if (error) return { data: null, error }

    const publicUrl = PUBLIC_BUCKETS.has(bucket)
      ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
      : null

    return { data: { path, publicUrl }, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

// ── Upload Avatar (convenience) ───────────────────────────────────────

/**
 * Upload or replace a user's avatar.
 * Returns the public URL on success.
 */
export async function uploadAvatar(
  userId: string,
  file: Blob | ArrayBuffer | File,
  mimeType: string,
  fileSize: number,
): Promise<UrlResult> {
  const result = await uploadFile('avatars', file, mimeType, fileSize, { userId })
  if (result.error) return { data: null, error: result.error }
  if (!result.data.publicUrl) {
    return { data: null, error: new Error('Failed to generate public URL for avatar') }
  }
  return { data: result.data.publicUrl, error: null }
}

// ── Upload Booking Photo (convenience) ────────────────────────────────

/**
 * Upload a before/after booking photo.
 * Returns the storage path (not a public URL — access is restricted).
 */
export async function uploadBookingPhoto(
  bookingId: string,
  photoType: 'before' | 'after',
  file: Blob | ArrayBuffer | File,
  mimeType: string,
  fileSize: number,
): Promise<StorageResult<string>> {
  const result = await uploadFile('booking-photos', file, mimeType, fileSize, {
    bookingId,
    photoType,
  })
  if (result.error) return { data: null, error: result.error }
  return { data: result.data.path, error: null }
}

// ── Upload Vetting Document (convenience) ─────────────────────────────

/**
 * Upload a provider vetting document (ID, insurance, credentials).
 * Returns the storage path (bucket is private).
 */
export async function uploadVettingDocument(
  userId: string,
  docLabel: string,
  file: Blob | ArrayBuffer | File,
  mimeType: string,
  fileSize: number,
): Promise<StorageResult<string>> {
  const result = await uploadFile('vetting-documents', file, mimeType, fileSize, {
    userId,
    docLabel,
  })
  if (result.error) return { data: null, error: result.error }
  return { data: result.data.path, error: null }
}

// ── Signed URL ────────────────────────────────────────────────────────

/**
 * Generate a time-limited signed URL for a private file.
 *
 * @param bucket      Storage bucket
 * @param path        File path within the bucket
 * @param expiresIn   Seconds until the URL expires (default: 3600 = 1 hour)
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn: number = 3600,
): Promise<UrlResult> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) return { data: null, error }
    return { data: data.signedUrl, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

// ── Public URL ────────────────────────────────────────────────────────

/**
 * Get the public URL for a file in a public bucket (e.g. avatars).
 * Returns an error if the bucket is not public.
 */
export function getPublicUrl(
  bucket: StorageBucket,
  path: string,
): UrlResult {
  if (!PUBLIC_BUCKETS.has(bucket)) {
    return {
      data: null,
      error: new Error(`Bucket "${bucket}" is not public. Use getSignedUrl instead.`),
    }
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { data: data.publicUrl, error: null }
}

// ── Delete ────────────────────────────────────────────────────────────

/**
 * Delete one or more files from a storage bucket.
 */
export async function deleteFiles(
  bucket: StorageBucket,
  paths: string[],
): Promise<DeleteResult> {
  try {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) return { data: null, error }
    return { data: true, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}
