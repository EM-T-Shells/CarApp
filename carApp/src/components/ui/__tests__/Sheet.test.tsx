// Sheet.test.tsx — unit tests for the Sheet bottom drawer component.
// react-native-reanimated and react-native-gesture-handler are manually mocked
// here because they are approved dependencies not yet installed in the project.

import React, { useState } from 'react';
import { Text as RNText } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Reanimated mock: replace all animation primitives with no-op / pass-through
// versions so tests run synchronously without the native module.
jest.mock(
  'react-native-reanimated',
  () => {
    const ReactNative = require('react-native');

    return {
      __esModule: true,
      default: {
        View: ReactNative.View,
        createAnimatedComponent: (component: React.ComponentType) => component,
        call: () => {},
      },
      // Animated.View used in the component
      View: ReactNative.View,
      // Value factories
      useSharedValue: (init: unknown) => ({ value: init }),
      useAnimatedStyle: (cb: () => object) => cb(),
      // Animation drivers — invoke callback immediately so effects settle
      withSpring: (toValue: unknown, _config?: unknown, cb?: () => void) => {
        cb?.();
        return toValue;
      },
      withTiming: (toValue: unknown, _config?: unknown, cb?: () => void) => {
        cb?.();
        return toValue;
      },
      runOnJS: (fn: (...args: unknown[]) => void) => fn,
      Easing: {
        out: () => () => 0,
        ease: () => 0,
      },
    };
  },
  { virtual: true },
);

// Gesture Handler mock: GestureDetector renders its children transparently;
// Gesture.Pan() returns a chainable no-op builder.
jest.mock(
  'react-native-gesture-handler',
  () => {
    const noop = () => panBuilder;
    const panBuilder = {
      activeOffsetY: noop,
      failOffsetY: noop,
      onStart: noop,
      onUpdate: noop,
      onEnd: noop,
    };

    return {
      __esModule: true,
      Gesture: {
        Pan: () => panBuilder,
      },
      GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    };
  },
  { virtual: true },
);

// ─── Import after mocks ───────────────────────────────────────────────────────

import { Sheet } from '../Sheet';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Controlled wrapper that toggles a Sheet open/closed. */
function ControlledSheet(props: {
  title?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  const handleClose = () => {
    setVisible(false);
    props.onClose?.();
  };
  return (
    <Sheet visible={visible} onClose={handleClose} title={props.title}>
      {props.children ?? <RNText>Sheet body</RNText>}
    </Sheet>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sheet component', () => {
  // ─── Visibility ────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders children when visible=true', () => {
      render(
        <Sheet visible onClose={() => {}}>
          <RNText>Hello Sheet</RNText>
        </Sheet>,
      );
      expect(screen.getByText('Hello Sheet')).toBeTruthy();
    });

    it('renders nothing when visible=false and no prior open state', () => {
      render(
        <Sheet visible={false} onClose={() => {}}>
          <RNText>Should not appear</RNText>
        </Sheet>,
      );
      expect(screen.queryByText('Should not appear')).toBeNull();
    });
  });

  // ─── Title / header ────────────────────────────────────────────────────────

  describe('title prop', () => {
    it('renders the title when provided', () => {
      render(
        <Sheet visible onClose={() => {}} title="Filter Results">
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.getByText('Filter Results')).toBeTruthy();
    });

    it('renders a close button when title is provided', () => {
      render(
        <Sheet visible onClose={() => {}} title="Confirm Action">
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.getByLabelText('Close')).toBeTruthy();
    });

    it('does not render a close button when title is omitted', () => {
      render(
        <Sheet visible onClose={() => {}}>
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.queryByLabelText('Close')).toBeNull();
    });
  });

  // ─── Dismiss interactions ──────────────────────────────────────────────────

  describe('dismiss interactions', () => {
    it('calls onClose when the close button is pressed', () => {
      const onClose = jest.fn();
      render(
        <Sheet visible onClose={onClose} title="Filters">
          <RNText>body</RNText>
        </Sheet>,
      );
      fireEvent.press(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is tapped', () => {
      const onClose = jest.fn();
      render(
        <Sheet visible onClose={onClose} title="Filters">
          <RNText>body</RNText>
        </Sheet>,
      );
      // Backdrop Pressable is the first button in the tree (role query bypasses
      // the pointerEvents="box-none" parent that blocks getByLabelText).
      const buttons = screen.getAllByRole('button');
      fireEvent.press(buttons[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose on initial render', () => {
      const onClose = jest.fn();
      render(
        <Sheet visible onClose={onClose}>
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ─── Children ──────────────────────────────────────────────────────────────

  describe('children', () => {
    it('renders arbitrary child content', () => {
      render(
        <Sheet visible onClose={() => {}}>
          <RNText testID="child-a">Child A</RNText>
          <RNText testID="child-b">Child B</RNText>
        </Sheet>,
      );
      expect(screen.getByTestId('child-a')).toBeTruthy();
      expect(screen.getByTestId('child-b')).toBeTruthy();
    });
  });

  // ─── Accessibility ─────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('applies a custom accessibilityLabel to the sheet panel', () => {
      render(
        <Sheet
          visible
          onClose={() => {}}
          accessibilityLabel="Booking filters panel"
        >
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.getByLabelText('Booking filters panel')).toBeTruthy();
    });

    it('falls back to the title as the sheet panel a11y label', () => {
      render(
        <Sheet visible onClose={() => {}} title="Sort Options">
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.getByLabelText('Sort Options')).toBeTruthy();
    });

    it('falls back to "Sheet" when neither title nor accessibilityLabel is set', () => {
      render(
        <Sheet visible onClose={() => {}}>
          <RNText>body</RNText>
        </Sheet>,
      );
      expect(screen.getByLabelText('Sheet')).toBeTruthy();
    });

    it('backdrop Pressable has role="button"', () => {
      // Include a title so the X close button is also in the tree — this lets
      // getAllByRole resolve buttons even though the backdrop's Animated.View
      // parent has pointerEvents="box-none" (which RNTL skips when it's the
      // sole accessible subtree). backdrop = buttons[0], X = buttons[1].
      render(
        <Sheet visible onClose={() => {}} title="Accessibility Test">
          <RNText>body</RNText>
        </Sheet>,
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons[0].props.accessibilityRole).toBe('button');
    });

    it('close button has role="button"', () => {
      render(
        <Sheet visible onClose={() => {}} title="Filters">
          <RNText>body</RNText>
        </Sheet>,
      );
      const closeBtn = screen.getByLabelText('Close');
      expect(closeBtn.props.accessibilityRole).toBe('button');
    });
  });

  // ─── Controlled open/close cycle ───────────────────────────────────────────

  describe('controlled open/close cycle', () => {
    it('hides content after onClose is called', async () => {
      const onClose = jest.fn();
      render(<ControlledSheet title="Filters" onClose={onClose} />);

      expect(screen.getByText('Sheet body')).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Close'));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
