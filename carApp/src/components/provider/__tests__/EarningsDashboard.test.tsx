// EarningsDashboard.test.tsx — unit tests for the provider earnings summary
// (Flow 5.7). Verifies paid/pending totals and the empty state.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

const mockGetPayouts = jest.fn();
jest.mock('../../../lib/supabase/queries', () => ({
  getPayoutsByProvider: (...a: unknown[]) => mockGetPayouts(...a),
}));

jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../ui/Button', () => {
  const { Text } = require('react-native');
  return { Button: ({ label }: { label: string }) => <Text>{label}</Text> };
});

import { EarningsDashboard } from '../EarningsDashboard';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EarningsDashboard', () => {
  it('sums paid and pending payouts (amounts stored as dollars)', async () => {
    mockGetPayouts.mockResolvedValue({
      data: [
        { id: 'p1', amount: 120, status: 'paid', paid_at: '2026-06-01T00:00:00Z' },
        { id: 'p2', amount: 80, status: 'paid', paid_at: '2026-06-03T00:00:00Z' },
        { id: 'p3', amount: 50, status: 'pending', paid_at: null },
      ],
      error: null,
    });

    render(<EarningsDashboard providerId="prov-1" />);

    // Paid total = $200.00, Pending total = $50.00 (centsToDisplay of dollars→cents).
    // $50.00 appears twice (pending summary + its payout row), so use getAllByText.
    await waitFor(() => expect(screen.getByText('$200.00')).toBeTruthy());
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0);
    expect(mockGetPayouts).toHaveBeenCalledWith('prov-1');
  });

  it('shows an empty state when there are no payouts', async () => {
    mockGetPayouts.mockResolvedValue({ data: [], error: null });

    render(<EarningsDashboard providerId="prov-1" />);

    await waitFor(() =>
      expect(screen.getByText(/No payouts yet/i)).toBeTruthy(),
    );
  });

  it('shows an error state with retry when the query fails', async () => {
    mockGetPayouts.mockResolvedValue({ data: null, error: new Error('boom') });

    render(<EarningsDashboard providerId="prov-1" />);

    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    expect(screen.getByText('Retry')).toBeTruthy();
  });
});
