// Card.test.tsx — unit tests for Card component.

import React from 'react';
import { Text as RNText } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Card, type CardVariant } from '../Card';

describe('Card component', () => {
  // ─── Basic Rendering ─────────────────────────────────────────────────────────

  it('renders children', () => {
    render(
      <Card>
        <RNText>Card content</RNText>
      </Card>
    );
    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('renders multiple children', () => {
    render(
      <Card>
        <RNText>First</RNText>
        <RNText>Second</RNText>
      </Card>
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  // ─── Variants ────────────────────────────────────────────────────────────────

  describe('variants', () => {
    const variants: CardVariant[] = ['elevated', 'outlined', 'flat'];

    variants.forEach((variant) => {
      it(`renders ${variant} variant without error`, () => {
        render(
          <Card variant={variant}>
            <RNText>Content</RNText>
          </Card>
        );
        expect(screen.getByText('Content')).toBeTruthy();
      });
    });

    it('defaults to elevated variant', () => {
      render(
        <Card>
          <RNText>Default</RNText>
        </Card>
      );
      expect(screen.getByText('Default')).toBeTruthy();
    });
  });

  // ─── Pressable Behavior ───────────────────────────────────────────────────────

  describe('pressable behavior', () => {
    it('renders as a button when onPress is provided', () => {
      const onPress = jest.fn();
      render(
        <Card onPress={onPress}>
          <RNText>Pressable card</RNText>
        </Card>
      );
      expect(screen.getByRole('button')).toBeTruthy();
    });

    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      render(
        <Card onPress={onPress}>
          <RNText>Press me</RNText>
        </Card>
      );
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
      const onPress = jest.fn();
      render(
        <Card onPress={onPress} disabled>
          <RNText>Disabled</RNText>
        </Card>
      );
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('sets disabled accessibility state when disabled', () => {
      const onPress = jest.fn();
      render(
        <Card onPress={onPress} disabled>
          <RNText>Disabled</RNText>
        </Card>
      );
      const card = screen.getByRole('button');
      expect(card.props.accessibilityState.disabled).toBe(true);
    });

    it('does not render as button when onPress is not provided', () => {
      render(
        <Card>
          <RNText>Static card</RNText>
        </Card>
      );
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  // ─── Accessibility ────────────────────────────────────────────────────────────

  it('applies accessibilityLabel when provided', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Card onPress={onPress} accessibilityLabel="Provider card">
        <RNText>Content</RNText>
      </Card>
    );
    expect(getByLabelText('Provider card')).toBeTruthy();
  });

  it('applies accessibilityLabel to static card', () => {
    const { getByLabelText } = render(
      <Card accessibilityLabel="Info card">
        <RNText>Content</RNText>
      </Card>
    );
    expect(getByLabelText('Info card')).toBeTruthy();
  });
});
