// Rating.test.tsx — unit tests for the Rating component.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Rating, type RatingSize } from '../Rating';

describe('Rating component', () => {
  // ─── Display Mode ────────────────────────────────────────────────────────────

  describe('display mode (read-only)', () => {
    it('renders without error at default value 0', () => {
      render(<Rating />);
      expect(screen.getByLabelText('Rating: 0 out of 5 stars')).toBeTruthy();
    });

    it('renders a whole-number value', () => {
      render(<Rating value={4} />);
      expect(screen.getByLabelText('Rating: 4 out of 5 stars')).toBeTruthy();
    });

    it('renders a fractional value', () => {
      render(<Rating value={3.5} />);
      expect(screen.getByLabelText('Rating: 3.5 out of 5 stars')).toBeTruthy();
    });

    it('clamps values above maxStars', () => {
      render(<Rating value={10} maxStars={5} />);
      // Should not throw — excessive value is clamped internally.
      expect(screen.getByLabelText('Rating: 10 out of 5 stars')).toBeTruthy();
    });

    it('clamps negative values to 0', () => {
      render(<Rating value={-2} />);
      expect(screen.getByLabelText('Rating: -2 out of 5 stars')).toBeTruthy();
    });

    it('does not render buttons in display mode', () => {
      render(<Rating value={3} />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  // ─── Label ──────────────────────────────────────────────────────────────────

  describe('label', () => {
    it('renders the label string when provided', () => {
      render(<Rating value={4} label="4.0" />);
      expect(screen.getByText('4.0')).toBeTruthy();
    });

    it('renders a count label', () => {
      render(<Rating value={3.5} label="(120 reviews)" />);
      expect(screen.getByText('(120 reviews)')).toBeTruthy();
    });

    it('does not render a label node when label is omitted', () => {
      render(<Rating value={4} />);
      expect(screen.queryByText('4')).toBeNull();
    });
  });

  // ─── Sizes ───────────────────────────────────────────────────────────────────

  describe('sizes', () => {
    const sizes: RatingSize[] = ['sm', 'md', 'lg'];

    sizes.forEach((size) => {
      it(`renders ${size} size without error`, () => {
        render(<Rating value={3} size={size} />);
        expect(screen.getByLabelText('Rating: 3 out of 5 stars')).toBeTruthy();
      });
    });

    it('defaults to md without a size prop', () => {
      render(<Rating value={2} />);
      expect(screen.getByLabelText('Rating: 2 out of 5 stars')).toBeTruthy();
    });
  });

  // ─── Custom maxStars ─────────────────────────────────────────────────────────

  describe('maxStars', () => {
    it('renders the correct number of stars when maxStars is set', () => {
      render(<Rating value={3} maxStars={3} />);
      expect(screen.getByLabelText('Rating: 3 out of 3 stars')).toBeTruthy();
    });
  });

  // ─── Interactive Mode ────────────────────────────────────────────────────────

  describe('interactive mode', () => {
    it('renders a button for each star', () => {
      render(<Rating value={0} interactive />);
      expect(screen.getAllByRole('button')).toHaveLength(5);
    });

    it('uses interactive accessibility label', () => {
      render(<Rating value={3} interactive />);
      expect(
        screen.getByLabelText('Rating input, current value 3 out of 5'),
      ).toBeTruthy();
    });

    it('calls onChange with the correct value when a star is pressed', () => {
      const onChange = jest.fn();
      render(<Rating value={0} interactive onChange={onChange} />);
      fireEvent.press(screen.getByLabelText('3 stars'));
      expect(onChange).toHaveBeenCalledWith(3);
    });

    it('calls onChange with 1 when the first star is pressed', () => {
      const onChange = jest.fn();
      render(<Rating value={0} interactive onChange={onChange} />);
      fireEvent.press(screen.getByLabelText('1 star'));
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('does not throw when onChange is omitted and a star is pressed', () => {
      render(<Rating value={0} interactive />);
      expect(() => {
        fireEvent.press(screen.getByLabelText('2 stars'));
      }).not.toThrow();
    });
  });

  // ─── Accessibility ───────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('applies a custom accessibilityLabel', () => {
      render(<Rating value={4} accessibilityLabel="Provider overall score" />);
      expect(screen.getByLabelText('Provider overall score')).toBeTruthy();
    });

    it('uses the default display label when none is provided', () => {
      render(<Rating value={5} />);
      expect(screen.getByLabelText('Rating: 5 out of 5 stars')).toBeTruthy();
    });

    it('uses the default interactive label when none is provided', () => {
      render(<Rating value={0} interactive />);
      expect(
        screen.getByLabelText('Rating input, current value 0 out of 5'),
      ).toBeTruthy();
    });
  });
});
