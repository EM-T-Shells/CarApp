// Pure-logic spec for the persona-webhook status mapping. The Edge Function
// runs on Deno with remote imports, so (per repo convention) this mirrors the
// exact personaStatus → identity_status decision from index.ts and locks it
// down — a change to that mapping must be a deliberate edit here too.

function mapIdentityStatus(personaStatus: string): string {
  return personaStatus === 'approved' || personaStatus === 'completed'
    ? 'approved'
    : personaStatus === 'declined' || personaStatus === 'failed'
      ? 'rejected'
      : 'submitted';
}

describe('persona identity_status mapping', () => {
  it('maps approved/completed → approved', () => {
    expect(mapIdentityStatus('approved')).toBe('approved');
    expect(mapIdentityStatus('completed')).toBe('approved');
  });

  it('maps declined/failed → rejected', () => {
    expect(mapIdentityStatus('declined')).toBe('rejected');
    expect(mapIdentityStatus('failed')).toBe('rejected');
  });

  it('maps anything else → submitted', () => {
    expect(mapIdentityStatus('pending')).toBe('submitted');
    expect(mapIdentityStatus('created')).toBe('submitted');
    expect(mapIdentityStatus('')).toBe('submitted');
  });
});
