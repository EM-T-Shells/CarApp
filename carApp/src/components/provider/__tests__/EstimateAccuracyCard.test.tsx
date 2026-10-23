// EstimateAccuracyCard — the provider's calibration report in words, and the
// card's loading / empty / error / populated states.

import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';

const mockGetCalibration = jest.fn();
jest.mock('../../../lib/supabase/queries', () => ({
  getDurationCalibration: (...a: unknown[]) => mockGetCalibration(...a),
}));

import EstimateAccuracyCard, { describeCalibration } from '../EstimateAccuracyCard';
import type { DurationCalibration } from '../../../lib/supabase/queries';

const ROW: DurationCalibration = {
  provider_id: 'prov-1',
  provider_name: 'Dana Rivers',
  completed_jobs: 10,
  timed_jobs: 8,
  avg_suggested_mins: 110,
  avg_estimated_mins: 120,
  avg_actual_mins: 140,
  avg_overrun_mins: 20,
  within_estimate_jobs: 3,
  over_estimate_jobs: 4,
  under_estimate_jobs: 1,
  late_start_jobs: 2,
  avg_start_delay_mins: 6,
  quoted_jobs: 9,
  surcharged_jobs: 5,
  avg_quote_markup_pct: 12.4,
  max_quote_markup_pct: 30,
};

describe('describeCalibration', () => {
  it('says how far over the estimates run, and nudges when it is a lot', () => {
    expect(describeCalibration(ROW)).toEqual({
      headline: 'Jobs take 20 min longer than you quote, on average.',
      lines: [
        '3 of 8 within 15 min · 4 ran over · 1 finished early',
        'Typical job: suggested 1 hr 50 min, you quoted 2 hr, it took 2 hr 20 min.',
        'Started 15+ min late: 2 of 10 jobs.',
        '5 of 9 quotes added charges, 12% above your listed price on average.',
      ],
      nudge:
        'Consider longer durations, or a job length adjustment below for the vehicles that run over.',
    });
  });

  it('calls estimates within a few minutes on target', () => {
    expect(describeCalibration({ ...ROW, avg_overrun_mins: -3 })?.headline).toBe(
      'Your jobs finish close to your estimates.',
    );
    expect(describeCalibration({ ...ROW, avg_overrun_mins: -3 })?.nudge).toBeNull();
  });

  it('says when jobs finish sooner than quoted', () => {
    expect(describeCalibration({ ...ROW, avg_overrun_mins: -25 })?.headline).toBe(
      'Jobs finish 25 min sooner than you quote, on average.',
    );
  });

  it('notes quotes that never added charges', () => {
    expect(describeCalibration({ ...ROW, surcharged_jobs: 0 })?.lines).toContain(
      'None of your 9 quotes added charges to your listed price.',
    );
  });

  it('has nothing to say before any job is measured', () => {
    expect(describeCalibration({ ...ROW, timed_jobs: 0 })).toBeNull();
  });
});

describe('EstimateAccuracyCard', () => {
  beforeEach(() => mockGetCalibration.mockReset());

  it('asks for the last 90 days', async () => {
    mockGetCalibration.mockResolvedValue({ data: [ROW], error: null });
    const before = Date.now();
    render(<EstimateAccuracyCard />);
    await waitFor(() => expect(mockGetCalibration).toHaveBeenCalled());
    const since = (mockGetCalibration.mock.calls[0][0] as Date).getTime();
    expect(before - since).toBeGreaterThanOrEqual(90 * 24 * 60 * 60 * 1000 - 1000);
  });

  it('shows the report', async () => {
    mockGetCalibration.mockResolvedValue({ data: [ROW], error: null });
    const view = render(<EstimateAccuracyCard />);
    await waitFor(() => view.getByTestId('estimate-accuracy-headline'));
    expect(view.getByText('Last 90 days · 8 completed jobs measured')).toBeTruthy();
  });

  it('explains the empty state', async () => {
    mockGetCalibration.mockResolvedValue({ data: [], error: null });
    const view = render(<EstimateAccuracyCard />);
    await waitFor(() => view.getByTestId('estimate-accuracy-empty'));
  });

  it('recovers from an error with a retry', async () => {
    mockGetCalibration.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    mockGetCalibration.mockResolvedValueOnce({ data: [ROW], error: null });
    const view = render(<EstimateAccuracyCard />);
    await waitFor(() => view.getByText(/Couldn't load your report\. offline/));
    await act(async () => {
      fireEvent.press(view.getByText('Retry'));
    });
    await waitFor(() => view.getByTestId('estimate-accuracy-headline'));
  });
});
