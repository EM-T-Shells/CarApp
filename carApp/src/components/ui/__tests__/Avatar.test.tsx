// Avatar.test.tsx — unit tests for Avatar component.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Avatar, type AvatarSize } from '../Avatar';

describe('Avatar component', () => {
  // ─── Initials Fallback ────────────────────────────────────────────────────────

  describe('initials fallback', () => {
    it('renders initials for a two-word name', () => {
      render(<Avatar name="John Smith" />);
      expect(screen.getByText('JS')).toBeTruthy();
    });

    it('renders single initial for a one-word name', () => {
      render(<Avatar name="Carlos" />);
      expect(screen.getByText('C')).toBeTruthy();
    });

    it('uses first and last word for names with more than two words', () => {
      render(<Avatar name="Mary Jane Watson" />);
      expect(screen.getByText('MW')).toBeTruthy();
    });

    it('renders ? when no name is provided', () => {
      render(<Avatar />);
      expect(screen.getByText('?')).toBeTruthy();
    });

    it('renders ? for an empty name string', () => {
      render(<Avatar name="" />);
      expect(screen.getByText('?')).toBeTruthy();
    });
  });

  // ─── Image Rendering ──────────────────────────────────────────────────────────

  describe('image rendering', () => {
    it('does not render initials when uri is provided', () => {
      render(<Avatar name="John Smith" uri="https://example.com/avatar.jpg" />);
      // Initials should not appear when an image loads successfully
      expect(screen.queryByText('JS')).toBeNull();
    });

    it('falls back to initials when uri is null', () => {
      render(<Avatar name="John Smith" uri={null} />);
      expect(screen.getByText('JS')).toBeTruthy();
    });
  });

  // ─── Sizes ───────────────────────────────────────────────────────────────────

  describe('sizes', () => {
    const sizes: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

    sizes.forEach((size) => {
      it(`renders ${size} size without error`, () => {
        render(<Avatar name="Alex Park" size={size} />);
        expect(screen.getByText('AP')).toBeTruthy();
      });
    });

    it('defaults to md size', () => {
      render(<Avatar name="Default Size" />);
      expect(screen.getByText('DS')).toBeTruthy();
    });
  });

  // ─── Presence Dot ─────────────────────────────────────────────────────────────

  describe('presence dot', () => {
    it('renders without error when online is true', () => {
      render(<Avatar name="Jane Doe" online={true} />);
      expect(screen.getByText('JD')).toBeTruthy();
    });

    it('renders without error when online is false', () => {
      render(<Avatar name="Jane Doe" online={false} />);
      expect(screen.getByText('JD')).toBeTruthy();
    });

    it('renders without error when online is omitted', () => {
      render(<Avatar name="Jane Doe" />);
      expect(screen.getByText('JD')).toBeTruthy();
    });
  });

  // ─── Pressable Behavior ───────────────────────────────────────────────────────

  describe('pressable behavior', () => {
    it('renders as a button when onPress is provided', () => {
      const onPress = jest.fn();
      render(<Avatar name="Press Me" onPress={onPress} />);
      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('calls onPress when tapped', () => {
      const onPress = jest.fn();
      render(<Avatar name="Press Me" onPress={onPress} />);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not render as a button when onPress is omitted', () => {
      render(<Avatar name="Static" />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  // ─── Accessibility ─────────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('uses default accessibility label derived from name', () => {
      const onPress = jest.fn();
      render(<Avatar name="Sara Lee" onPress={onPress} />);
      expect(screen.getByLabelText("Sara Lee's avatar")).toBeTruthy();
    });

    it('uses custom accessibilityLabel when provided', () => {
      const onPress = jest.fn();
      render(<Avatar name="Sara Lee" onPress={onPress} accessibilityLabel="Provider photo" />);
      expect(screen.getByLabelText('Provider photo')).toBeTruthy();
    });

    it('falls back to "Avatar" label when no name is provided', () => {
      const onPress = jest.fn();
      render(<Avatar onPress={onPress} />);
      expect(screen.getByLabelText('Avatar')).toBeTruthy();
    });
  });
});
