// Push → route mapping. The Firebase module and the mutations it imports are
// mocked out; only the pure routing table is under test.

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: jest.fn(),
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
}));

jest.mock('../../supabase/mutations', () => ({
  updateUserPushToken: jest.fn(),
}));

import { resolvePushRoute } from '../push';

describe('resolvePushRoute', () => {
  it('prefers an explicit route from the payload', () => {
    expect(
      resolvePushRoute({ type: 'quote_requested', bookingId: 'b1', route: '/custom' }),
    ).toBe('/custom');
  });

  // notify-quote-ready as deployed sends no route; the tap must still land on
  // the approval screen rather than nowhere.
  it('sends a quote-ready tap to the approval screen', () => {
    expect(resolvePushRoute({ type: 'quote_ready', bookingId: 'b1' })).toBe('/bookings/quote/b1');
  });

  it('sends the customer to the booking for things they must answer', () => {
    expect(resolvePushRoute({ type: 'photos_requested', bookingId: 'b1' })).toBe('/bookings/b1');
    expect(resolvePushRoute({ type: 'adjustment_proposed', bookingId: 'b1' })).toBe('/bookings/b1');
  });

  it('sends the provider to the quote screen or the job', () => {
    expect(resolvePushRoute({ type: 'quote_requested', bookingId: 'b1' })).toBe(
      '/(provider-tabs)/jobs/quote/b1',
    );
    expect(resolvePushRoute({ type: 'adjustment_approved', bookingId: 'b1' })).toBe(
      '/(provider-tabs)/jobs/b1',
    );
  });

  it('returns null when a booking route has no booking id', () => {
    expect(resolvePushRoute({ type: 'quote_ready' })).toBeNull();
  });

  it('keeps the existing routes', () => {
    expect(resolvePushRoute({ type: 'booking_confirmed', bookingId: 'b1' })).toBe('/bookings/b1');
    expect(resolvePushRoute({ type: 'provider_enroute', bookingId: 'b1' })).toBe(
      '/bookings/tracking/b1',
    );
  });
});
