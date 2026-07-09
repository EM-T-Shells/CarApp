// Pure-logic spec for the checkr-webhook status mapping. The Edge Function
// runs on Deno with remote imports, so (per repo convention) this mirrors the
// exact reportStatus → background_status decision from index.ts and locks it
// down — a change to that mapping must be a deliberate edit here too.

function mapBackgroundStatus(reportStatus: string): string {
  return reportStatus === 'clear' || reportStatus === 'complete'
    ? 'approved'
    : reportStatus === 'consider' || reportStatus === 'suspended'
      ? 'rejected'
      : 'submitted';
}

describe('checkr background_status mapping', () => {
  it('maps clear/complete → approved', () => {
    expect(mapBackgroundStatus('clear')).toBe('approved');
    expect(mapBackgroundStatus('complete')).toBe('approved');
  });

  it('maps consider/suspended → rejected', () => {
    expect(mapBackgroundStatus('consider')).toBe('rejected');
    expect(mapBackgroundStatus('suspended')).toBe('rejected');
  });

  it('maps anything else → submitted', () => {
    expect(mapBackgroundStatus('pending')).toBe('submitted');
    expect(mapBackgroundStatus('unknown')).toBe('submitted');
    expect(mapBackgroundStatus('')).toBe('submitted');
  });
});
