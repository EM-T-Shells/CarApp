// account.test.tsx — unit tests for the Account screen (Flows 3.1 + 3.2):
// vehicle list states, vehicle CRUD actions, profile-name save, and the
// avatar permission guard.

import React from 'react';
import { Alert } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetVehicles = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getVehiclesByUser: (...a: unknown[]) => mockGetVehicles(...a),
}));

const mockUpdateUser = jest.fn();
const mockInsertVehicle = jest.fn();
const mockUpdateVehicle = jest.fn();
const mockDeleteVehicle = jest.fn();
jest.mock('../../../../src/lib/supabase/mutations', () => ({
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
  insertVehicle: (...a: unknown[]) => mockInsertVehicle(...a),
  updateVehicle: (...a: unknown[]) => mockUpdateVehicle(...a),
  deleteVehicle: (...a: unknown[]) => mockDeleteVehicle(...a),
}));

const mockUploadAvatar = jest.fn();
jest.mock('../../../../src/lib/supabase/storage', () => ({
  uploadAvatar: (...a: unknown[]) => mockUploadAvatar(...a),
}));

const mockRequestPerm = jest.fn();
const mockLaunch = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestPerm(),
  launchImageLibraryAsync: () => mockLaunch(),
}));

let mockUser: Record<string, unknown> | null = {
  id: 'user-1',
  full_name: 'Jordan Lee',
  email: 'jordan@example.com',
  phone: null,
  avatar_url: null,
};
const mockSession = { user: { id: 'user-1' } };
const mockSetSession = jest.fn();
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      user: mockUser,
      session: mockSession,
      setSession: mockSetSession,
    }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return {
    Camera: icon('Camera'),
    Car: icon('Car'),
    Pencil: icon('Pencil'),
    Plus: icon('Plus'),
    Star: icon('Star'),
    Trash2: icon('Trash2'),
  };
});

jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../../src/components/ui/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View testID="avatar" /> };
});
jest.mock('../../../../src/components/ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../../../src/components/ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) => (
      <TouchableOpacity onPress={onPress} testID={testID}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});
jest.mock('../../../../src/components/ui/TextField', () => {
  const { TextInput } = require('react-native');
  return {
    TextField: ({
      label,
      value,
      onChangeText,
    }: {
      label?: string;
      value: string;
      onChangeText: (v: string) => void;
    }) => (
      <TextInput
        testID={`field-${label}`}
        value={value}
        onChangeText={onChangeText}
      />
    ),
  };
});
jest.mock('../../../../src/components/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, title, children }: { visible: boolean; title?: string; children: React.ReactNode }) =>
      visible ? (
        <View testID="sheet">
          <View testID="sheet-title">{title}</View>
          {children}
        </View>
      ) : null,
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeVehicle = (o: Record<string, unknown> = {}) => ({
  id: 'veh-1',
  user_id: 'user-1',
  year: '2022',
  make: 'Honda',
  model: 'Civic',
  trim: null,
  color: 'Blue',
  license_plate: null,
  vin: null,
  is_primary: true,
  created_at: '2026-01-01T00:00:00Z',
  ...o,
});

import AccountScreen from '../account';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    id: 'user-1',
    full_name: 'Jordan Lee',
    email: 'jordan@example.com',
    phone: null,
    avatar_url: null,
  };
  mockGetVehicles.mockResolvedValue({ data: [makeVehicle()], error: null });
  mockUpdateUser.mockResolvedValue({ data: { ...mockUser, full_name: 'New Name' }, error: null });
  mockUpdateVehicle.mockResolvedValue({ data: makeVehicle(), error: null });
  mockDeleteVehicle.mockResolvedValue({ data: true, error: null });
  mockInsertVehicle.mockResolvedValue({ data: makeVehicle(), error: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccountScreen', () => {
  it('loads vehicles for the signed-in user', async () => {
    render(<AccountScreen />);
    await waitFor(() => {
      expect(mockGetVehicles).toHaveBeenCalledWith('user-1');
    });
    expect(await screen.findByText('2022 Honda Civic')).toBeTruthy();
  });

  it('shows the empty state when there are no vehicles', async () => {
    mockGetVehicles.mockResolvedValue({ data: [], error: null });
    render(<AccountScreen />);
    expect(
      await screen.findByText('No vehicles yet. Add the car you want serviced.'),
    ).toBeTruthy();
  });

  it('shows an error state with retry on load failure', async () => {
    mockGetVehicles.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<AccountScreen />);
    expect(await screen.findByText('Could not load your vehicles.')).toBeTruthy();
  });

  it('renders contact methods (email + phone fallback)', async () => {
    render(<AccountScreen />);
    expect(await screen.findByText('jordan@example.com')).toBeTruthy();
    expect(screen.getByText('Not added')).toBeTruthy(); // phone is null
  });

  it('saves an edited name and updates the auth store', async () => {
    render(<AccountScreen />);
    await screen.findByText('2022 Honda Civic');
    fireEvent.changeText(screen.getByTestId('field-Full name'), 'New Name');
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-save-name'));
    });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { full_name: 'New Name' });
    expect(mockSetSession).toHaveBeenCalled();
  });

  it('confirms then deletes a vehicle', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.text === 'Remove')?.onPress?.();
      });
    render(<AccountScreen />);
    await screen.findByText('2022 Honda Civic');
    await act(async () => {
      fireEvent.press(screen.getByTestId('vehicle-delete-veh-1'));
    });
    expect(mockDeleteVehicle).toHaveBeenCalledWith('veh-1');
    alertSpy.mockRestore();
  });

  it('makes a non-primary vehicle primary and unsets the previous one', async () => {
    mockGetVehicles.mockResolvedValue({
      data: [
        makeVehicle({ id: 'veh-1', is_primary: true }),
        makeVehicle({ id: 'veh-2', make: 'Toyota', model: 'Corolla', is_primary: false }),
      ],
      error: null,
    });
    render(<AccountScreen />);
    await screen.findByText('2022 Toyota Corolla');
    await act(async () => {
      fireEvent.press(screen.getByTestId('vehicle-primary-veh-2'));
    });
    expect(mockUpdateVehicle).toHaveBeenCalledWith('veh-2', { is_primary: true });
    await waitFor(() => {
      expect(mockUpdateVehicle).toHaveBeenCalledWith('veh-1', { is_primary: false });
    });
  });

  it('opens the vehicle editor sheet when Add is pressed', async () => {
    render(<AccountScreen />);
    await screen.findByText('2022 Honda Civic');
    fireEvent.press(screen.getByTestId('account-add-vehicle'));
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByText('Add vehicle')).toBeTruthy();
  });

  it('blocks avatar change when photo permission is denied', async () => {
    mockRequestPerm.mockResolvedValue({ granted: false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<AccountScreen />);
    await screen.findByText('2022 Honda Civic');
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-change-avatar'));
    });
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(mockUploadAvatar).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
