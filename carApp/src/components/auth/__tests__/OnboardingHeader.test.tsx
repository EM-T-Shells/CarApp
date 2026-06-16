// OnboardingHeader.test.tsx — unit tests for the shared account-creation
// header (dark bar, wordmark, optional back chevron, optional progress dots).

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { ChevronLeft: () => <View testID="icon-ChevronLeft" /> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

import { OnboardingHeader } from '../OnboardingHeader';

describe('OnboardingHeader', () => {
  it('renders the brand wordmark (default CarApp)', () => {
    render(<OnboardingHeader />);
    expect(screen.getByText('CarApp')).toBeTruthy();
  });

  it('renders a custom brand when provided', () => {
    render(<OnboardingHeader brand="Stabl" />);
    expect(screen.getByText('Stabl')).toBeTruthy();
  });

  it('shows a back button only when onBack is provided', () => {
    const onBack = jest.fn();
    const { rerender } = render(<OnboardingHeader />);
    expect(screen.queryByTestId('onboarding-header-back')).toBeNull();

    rerender(<OnboardingHeader onBack={onBack} />);
    fireEvent.press(screen.getByTestId('onboarding-header-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders a progressbar with the current step when step props are given', () => {
    render(<OnboardingHeader currentStep={1} totalSteps={4} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 2 });
  });

  it('omits the progressbar when step props are missing', () => {
    render(<OnboardingHeader />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
