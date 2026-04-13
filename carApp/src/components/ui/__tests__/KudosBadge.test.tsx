// KudosBadge.test.tsx — unit tests for the KudosBadge component.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { KudosBadge, ALL_KUDOS, type KudosType } from '../KudosBadge';

describe('KudosBadge component', () => {
  // ─── Display Mode ─────────────────────────────────────────────────────────

  describe('display mode (read-only)', () => {
    it('renders without error for every kudos type', () => {
      ALL_KUDOS.forEach((badge) => {
        const { unmount } = render(<KudosBadge badge={badge} />);
        expect(screen.getByText(badge)).toBeTruthy();
        unmount();
      });
    });

    it('renders the badge label', () => {
      render(<KudosBadge badge="Meticulous" />);
      expect(screen.getByText('Meticulous')).toBeTruthy();
    });

    it('does not render a button in display mode', () => {
      render(<KudosBadge badge="Reliable" />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('does not render the count when count is 0', () => {
      render(<KudosBadge badge="Fast Worker" count={0} />);
      expect(screen.queryByText(/×/)).toBeNull();
    });

    it('does not render the count when count is omitted', () => {
      render(<KudosBadge badge="Fast Worker" />);
      expect(screen.queryByText(/×/)).toBeNull();
    });
  });

  // ─── Count Display ────────────────────────────────────────────────────────

  describe('count display', () => {
    it('renders the count when count > 0', () => {
      render(<KudosBadge badge="Communicator" count={7} />);
      expect(screen.getByText('×7')).toBeTruthy();
    });

    it('renders count=1 correctly', () => {
      render(<KudosBadge badge="Communicator" count={1} />);
      expect(screen.getByText('×1')).toBeTruthy();
    });
  });

  // ─── Interactive Mode ─────────────────────────────────────────────────────

  describe('interactive mode', () => {
    it('renders a button when onPress is provided', () => {
      render(<KudosBadge badge="Reliable" onPress={() => {}} />);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('calls onPress when tapped', () => {
      const onPress = jest.fn();
      render(<KudosBadge badge="Reliable" onPress={onPress} />);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onPress is called without selected state', () => {
      const onPress = jest.fn();
      render(<KudosBadge badge="Magic Hands" onPress={onPress} />);
      expect(() => {
        fireEvent.press(screen.getByRole('button'));
      }).not.toThrow();
    });
  });

  // ─── Selected State ───────────────────────────────────────────────────────

  describe('selected state', () => {
    it('reflects selected=true in the accessibility state', () => {
      render(
        <KudosBadge badge="Great Value" onPress={() => {}} selected />,
      );
      const button = screen.getByRole('button');
      expect(button.props.accessibilityState?.selected).toBe(true);
    });

    it('reflects selected=false in the accessibility state', () => {
      render(
        <KudosBadge badge="Great Value" onPress={() => {}} selected={false} />,
      );
      const button = screen.getByRole('button');
      expect(button.props.accessibilityState?.selected).toBe(false);
    });
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('applies a custom accessibilityLabel', () => {
      render(
        <KudosBadge
          badge="Meticulous"
          accessibilityLabel="Meticulous badge — awarded 3 times"
        />,
      );
      expect(
        screen.getByLabelText('Meticulous badge — awarded 3 times'),
      ).toBeTruthy();
    });

    it('generates a default a11y label from badge name only when no count', () => {
      render(<KudosBadge badge="Fast Worker" onPress={() => {}} />);
      expect(screen.getByLabelText('Fast Worker')).toBeTruthy();
    });

    it('includes "received N times" in a11y label when count is set', () => {
      render(<KudosBadge badge="Reliable" count={5} />);
      expect(screen.getByLabelText('Reliable, received 5 times')).toBeTruthy();
    });

    it('includes "selected" in a11y label when selected=true', () => {
      render(
        <KudosBadge badge="Reliable" onPress={() => {}} selected count={3} />,
      );
      expect(
        screen.getByLabelText('Reliable, received 3 times, selected'),
      ).toBeTruthy();
    });
  });

  // ─── Size Prop ────────────────────────────────────────────────────────────

  describe('size prop', () => {
    (['sm', 'md'] as const).forEach((size) => {
      it(`renders without error at size="${size}"`, () => {
        render(<KudosBadge badge="Meticulous" size={size} />);
        expect(screen.getByText('Meticulous')).toBeTruthy();
      });
    });

    it('defaults to md without a size prop', () => {
      render(<KudosBadge badge="Meticulous" />);
      expect(screen.getByText('Meticulous')).toBeTruthy();
    });
  });

  // ─── ALL_KUDOS export ─────────────────────────────────────────────────────

  describe('ALL_KUDOS export', () => {
    it('exports all 6 kudos types', () => {
      expect(ALL_KUDOS).toHaveLength(6);
    });

    it('contains the correct badge names', () => {
      const expected: KudosType[] = [
        'Meticulous',
        'Reliable',
        'Magic Hands',
        'Great Value',
        'Fast Worker',
        'Communicator',
      ];
      expect(ALL_KUDOS).toEqual(expected);
    });
  });
});
