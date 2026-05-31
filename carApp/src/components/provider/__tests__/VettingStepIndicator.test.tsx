// VettingStepIndicator.test.tsx — unit tests for the vetting progress tracker.

import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { Check: () => <View testID="icon-Check" /> };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});

import {
  VettingStepIndicator,
  type VettingStepItem,
} from '../VettingStepIndicator';

const steps: VettingStepItem[] = [
  { key: 'profile', label: 'Profile', status: 'approved' },
  { key: 'identity', label: 'Identity', status: 'submitted' },
  { key: 'bank', label: 'Bank', status: 'pending' },
];

describe('VettingStepIndicator', () => {
  it('renders a label for every step', () => {
    render(<VettingStepIndicator steps={steps} />);
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByText('Identity')).toBeTruthy();
    expect(screen.getByText('Bank')).toBeTruthy();
  });

  it('shows a check for approved steps and the index for the rest', () => {
    render(<VettingStepIndicator steps={steps} />);
    // One approved step → one check icon.
    expect(screen.getAllByTestId('icon-Check')).toHaveLength(1);
    // Non-approved steps show their 1-based position.
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
