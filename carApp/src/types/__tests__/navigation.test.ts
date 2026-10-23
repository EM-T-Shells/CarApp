import type {
  ProviderDetailParams,
  BookProviderParams,
  ServiceProvidersParams,
  BookingDetailParams,
  BookingTrackingParams,
  MessageThreadParams,
} from '../navigation'

/**
 * Type-level tests for navigation params.
 *
 * These tests verify that the param types exist, have the correct shape,
 * and enforce string-only values (matching Expo Router runtime behavior).
 */

describe('Navigation param types', () => {
  it('ProviderDetailParams has id: string', () => {
    const params: ProviderDetailParams = { id: 'abc-123' }
    expect(params).toEqual({ id: 'abc-123' })
    expect(Object.keys(params)).toEqual(['id'])
  })

  it('BookProviderParams has providerId: string', () => {
    const params: BookProviderParams = { providerId: 'provider-456' }
    expect(params).toEqual({ providerId: 'provider-456' })
    expect(Object.keys(params)).toEqual(['providerId'])
  })

  it('ServiceProvidersParams has catalogId and optional name', () => {
    const params: ServiceProvidersParams = {
      catalogId: 'cat-123',
      name: 'Full Detail',
    }
    expect(params).toEqual({ catalogId: 'cat-123', name: 'Full Detail' })
    const minimal: ServiceProvidersParams = { catalogId: 'cat-123' }
    expect(Object.keys(minimal)).toEqual(['catalogId'])
  })

  it('BookingDetailParams has id: string', () => {
    const params: BookingDetailParams = { id: 'booking-789' }
    expect(params).toEqual({ id: 'booking-789' })
    expect(Object.keys(params)).toEqual(['id'])
  })

  it('BookingTrackingParams has bookingId: string', () => {
    const params: BookingTrackingParams = { bookingId: 'track-012' }
    expect(params).toEqual({ bookingId: 'track-012' })
    expect(Object.keys(params)).toEqual(['bookingId'])
  })

  it('MessageThreadParams has threadId: string', () => {
    const params: MessageThreadParams = { threadId: 'thread-345' }
    expect(params).toEqual({ threadId: 'thread-345' })
    expect(Object.keys(params)).toEqual(['threadId'])
  })
})
