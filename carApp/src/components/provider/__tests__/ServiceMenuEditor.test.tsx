// ServiceMenuEditor.test.tsx — unit tests for the provider service-menu editor.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockGetOwn = jest.fn();
jest.mock('../../../lib/supabase/queries', () => ({
  getProviderOwnServicePackages: (...a: unknown[]) => mockGetOwn(...a),
}));

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../../lib/supabase/mutations', () => ({
  insertServicePackage: (...a: unknown[]) => mockInsert(...a),
  updateServicePackage: (...a: unknown[]) => mockUpdate(...a),
  deleteServicePackage: (...a: unknown[]) => mockDelete(...a),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { Pencil: icon('Pencil'), Plus: icon('Plus'), Trash2: icon('Trash2') };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../ui/Button', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    Button: ({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) => (
      <TouchableOpacity onPress={onPress} testID={testID}><Text>{label}</Text></TouchableOpacity>
    ),
  };
});
jest.mock('../../ui/TextField', () => {
  const { TextInput } = require('react-native');
  return {
    TextField: ({ label, value, onChangeText }: { label?: string; value: string; onChangeText: (v: string) => void }) => (
      <TextInput testID={`field-${label}`} value={value} onChangeText={onChangeText} />
    ),
  };
});
jest.mock('../../ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="sheet">{children}</View> : null,
  };
});

import { ServiceMenuEditor } from '../ServiceMenuEditor';

const makePkg = (o: Record<string, unknown> = {}) => ({
  id: 'pkg-1',
  provider_id: 'pp-1',
  catalog_id: null,
  name: 'Full Detail',
  description: null,
  category: 'detailing',
  base_price: 15000,
  duration_mins: 120,
  is_active: true,
  is_custom: true,
  is_approved: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...o,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetOwn.mockResolvedValue({ data: [makePkg()], error: null });
  mockInsert.mockResolvedValue({ data: makePkg({ id: 'pkg-2' }), error: null });
  mockDelete.mockResolvedValue({ data: true, error: null });
});

describe('ServiceMenuEditor', () => {
  it('lists existing packages with formatted price', async () => {
    render(<ServiceMenuEditor providerId="pp-1" />);
    expect(await screen.findByText('Full Detail')).toBeTruthy();
    expect(screen.getByText('$150.00 · 120 min')).toBeTruthy();
  });

  it('adds a service, storing the price in cents', async () => {
    render(<ServiceMenuEditor providerId="pp-1" />);
    await screen.findByText('Full Detail');
    fireEvent.press(screen.getByTestId('service-add'));
    fireEvent.changeText(screen.getByTestId('field-Service name'), 'Express Wash');
    fireEvent.changeText(screen.getByTestId('field-Price (USD)'), '60');
    fireEvent.changeText(screen.getByTestId('field-Duration (minutes)'), '45');
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockInsert).toHaveBeenCalledWith({
      provider_id: 'pp-1',
      is_custom: true,
      name: 'Express Wash',
      category: 'detailing',
      base_price: 6000,
      duration_mins: 45,
      description: null,
    });
  });

  it('marks unapproved packages as pending review', async () => {
    mockGetOwn.mockResolvedValue({ data: [makePkg({ is_approved: false })], error: null });
    render(<ServiceMenuEditor providerId="pp-1" />);
    expect(await screen.findByText('Pending review')).toBeTruthy();
  });
});
