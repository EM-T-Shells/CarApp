// StatusTimeline.test.tsx — unit tests for the booking lifecycle timeline.

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  StatusTimeline,
  type BookingStatus,
} from '../StatusTimeline';

describe('StatusTimeline', () => {
  const STEPS: BookingStatus[] = [
    'pending',
    'confirmed',
    'en_route',
    'in_progress',
    'completed',
  ];

  // ─── Active progression ──────────────────────────────────────────────

  describe('active statuses', () => {
    it.each(STEPS)('renders all 5 step labels for status=%s', (status) => {
      render(<StatusTimeline status={status} />);
      expect(screen.getByText('Pending')).toBeTruthy();
      expect(screen.getByText('Confirmed')).toBeTruthy();
      expect(screen.getByText('En Route')).toBeTruthy();
      expect(screen.getByText('In Progress')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
    });

    it.each(STEPS)(
      'exposes the current step index via accessibilityValue for status=%s',
      (status) => {
        render(<StatusTimeline status={status} />);
        const expectedIndex = STEPS.indexOf(status);
        const expectedLabel = `Booking status: ${[
          'Pending',
          'Confirmed',
          'En Route',
          'In Progress',
          'Completed',
        ][expectedIndex]}`;
        const bar = screen.getByLabelText(expectedLabel);
        expect(bar.props.accessibilityValue?.now).toBe(expectedIndex);
        expect(bar.props.accessibilityValue?.max).toBe(STEPS.length - 1);
      },
    );
  });

  // ─── Cancelled ───────────────────────────────────────────────────────

  describe('cancelled status', () => {
    it('renders a single "Cancelled" pill instead of the progress bar', () => {
      render(<StatusTimeline status="cancelled" />);
      expect(screen.getByText('Cancelled')).toBeTruthy();
      expect(screen.queryByLabelText(/^Booking status:/)).toBeNull();
    });

    it('does not render the active step labels when cancelled', () => {
      render(<StatusTimeline status="cancelled" />);
      expect(screen.queryByText('Pending')).toBeNull();
      expect(screen.queryByText('Completed')).toBeNull();
    });
  });

  // ─── Unknown status fallback ─────────────────────────────────────────

  describe('unknown status fallback', () => {
    it('does not crash and falls back to the first step', () => {
      // @ts-expect-error — exercising the runtime fallback path
      render(<StatusTimeline status="weird_state" />);
      const bar = screen.getByLabelText('Booking status: Pending');
      expect(bar.props.accessibilityValue?.now).toBe(0);
    });
  });
});
