// LugBubble.test.tsx — unit tests for the floating Lug button (Flow 3.6).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { Bot: () => <View testID="icon-Bot" /> };
});

import { LugBubble } from '../LugBubble';

beforeEach(() => jest.clearAllMocks());

describe('LugBubble', () => {
  it('navigates to the full-screen Lug view by default', () => {
    render(<LugBubble />);
    fireEvent.press(screen.getByTestId('lug-bubble'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/lug');
  });

  it('uses a custom onPress when provided', () => {
    const onPress = jest.fn();
    render(<LugBubble onPress={onPress} />);
    fireEvent.press(screen.getByTestId('lug-bubble'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
