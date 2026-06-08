// profile.test.tsx — unit tests for the vetting Profile step (Flow 4.7).

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

const mockGetProvider = jest.fn();
const mockGetOwnPkgs = jest.fn();
jest.mock('../../../src/lib/supabase/queries', () => ({
  getProviderByUserId: (...a: unknown[]) => mockGetProvider(...a),
  getProviderOwnServicePackages: (...a: unknown[]) => mockGetOwnPkgs(...a),
}));

const mockUpdateProfile = jest.fn();
const mockUpdateVetting = jest.fn();
jest.mock('../../../src/lib/supabase/mutations', () => ({
  updateProviderProfile: (...a: unknown[]) => mockUpdateProfile(...a),
  updateProviderVetting: (...a: unknown[]) => mockUpdateVetting(...a),
}));

const mockAuthUser = { id: 'user-1' };
jest.mock('../../../src/state/auth', () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: mockAuthUser }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));

jest.mock('../../../src/components/provider/ServiceMenuEditor', () => {
  const { View } = require('react-native');
  return { ServiceMenuEditor: () => <View testID="service-menu-editor" /> };
});
jest.mock('../../../src/components/provider/AvailabilityCalendar', () => {
  const { View } = require('react-native');
  return {
    AvailabilityCalendar: () => <View testID="availability-calendar" />,
    DEFAULT_AVAILABILITY: { mon: true },
    availabilityFromJson: () => ({ mon: true }),
  };
});
jest.mock('../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../src/components/ui/TextField', () => {
  const { TextInput } = require('react-native');
  return {
    TextField: ({ label, value, onChangeText }: { label?: string; value: string; onChangeText: (v: string) => void }) => (
      <TextInput testID={`field-${label}`} value={value} onChangeText={onChangeText} />
    ),
  };
});
jest.mock('../../../src/components/ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) => (
      <TouchableOpacity onPress={onPress} testID={testID}><Text>{label}</Text></TouchableOpacity>
    ),
  };
});

import ProfileStep from '../profile';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProvider.mockResolvedValue({
    data: { id: 'pp-1', bio: '', coverage_area: '', mile_radius: null },
    error: null,
  });
  mockGetOwnPkgs.mockResolvedValue({ data: [{ id: 'pkg-1' }], error: null });
  mockUpdateProfile.mockResolvedValue({ data: { id: 'pp-1' }, error: null });
  mockUpdateVetting.mockResolvedValue({ data: true, error: null });
});

describe('ProfileStep', () => {
  it('loads the provider profile and renders the editors', async () => {
    render(<ProfileStep />);
    expect(await screen.findByTestId('service-menu-editor')).toBeTruthy();
    expect(screen.getByTestId('availability-calendar')).toBeTruthy();
    expect(mockGetProvider).toHaveBeenCalledWith('user-1');
  });

  it('saves profile fields and recomputes completeness', async () => {
    render(<ProfileStep />);
    await screen.findByTestId('service-menu-editor');
    fireEvent.changeText(
      screen.getByTestId('field-Bio'),
      'Seasoned detailer with a decade of experience.',
    );
    fireEvent.changeText(screen.getByTestId('field-Coverage area'), 'Reston, Vienna');
    fireEvent.changeText(screen.getByTestId('field-Travel radius (miles)'), '25');
    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-save'));
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith('pp-1', {
      bio: 'Seasoned detailer with a decade of experience.',
      coverage_area: 'Reston, Vienna',
      mile_radius: 25,
      availability: { mon: true },
    });
    // 20 (type) + 20 (bio) + 20 (coverage) + 10 (radius) + 30 (has services) = 100
    expect(mockUpdateVetting).toHaveBeenCalledWith('pp-1', { profile_completeness: 100 });
    expect(mockBack).toHaveBeenCalled();
  });
});
