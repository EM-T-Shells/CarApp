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
  // NUMERIC(10,2) whole dollars, as the column and every seeded row store it.
  base_price: 150,
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

  it('adds a service, storing the price in dollars', async () => {
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
      base_price: 60,
      duration_mins: 45,
      duration_min_mins: null,
      duration_max_mins: null,
      description: null,
      tier: null,
      parent_package_id: null,
    });
  });

  // ── Tiers, ranges, add-ons (Phase 3) ────────────────────────────────

  async function openAddForm() {
    render(<ServiceMenuEditor providerId="pp-1" />);
    await screen.findByText('Full Detail');
    fireEvent.press(screen.getByTestId('service-add'));
    fireEvent.changeText(screen.getByTestId('field-Service name'), 'Ceramic Boost');
    fireEvent.changeText(screen.getByTestId('field-Price (USD)'), '40');
    fireEvent.changeText(screen.getByTestId('field-Duration (minutes)'), '30');
  }

  it('saves a tier and an advertised range on a main service', async () => {
    await openAddForm();
    fireEvent.press(screen.getByTestId('service-tier-premium'));
    fireEvent.changeText(screen.getByTestId('field-Shortest (minutes)'), '120');
    fireEvent.changeText(screen.getByTestId('field-Longest (minutes)'), '180');
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'premium', duration_min_mins: 120, duration_max_mins: 180 }),
    );
  });

  // service_packages_duration_range_check refuses one end without the other.
  it('refuses half a range before it reaches the database', async () => {
    await openAddForm();
    fireEvent.changeText(screen.getByTestId('field-Shortest (minutes)'), '120');
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses a range the wrong way round', async () => {
    await openAddForm();
    fireEvent.changeText(screen.getByTestId('field-Shortest (minutes)'), '180');
    fireEvent.changeText(screen.getByTestId('field-Longest (minutes)'), '120');
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // An add-on is untiered and takes its main service's category — the
  // database enforces both, so the editor must not send anything else.
  it('saves an add-on attached to a main service, untiered', async () => {
    await openAddForm();
    fireEvent.press(screen.getByTestId('service-tier-basic'));
    fireEvent.press(screen.getByTestId('service-parent-pkg-1'));
    // Tier and category are the parent's business once it is an add-on.
    expect(screen.queryByTestId('service-tier-basic')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_package_id: 'pkg-1', tier: null, category: 'detailing' }),
    );
  });

  it('no longer offers the retired add-on category', async () => {
    await openAddForm();
    expect(screen.queryByTestId('service-category-addon')).toBeNull();
  });

  it('labels an add-on with the service it belongs to', async () => {
    mockGetOwn.mockResolvedValue({
      data: [makePkg(), makePkg({ id: 'pkg-2', name: 'Pet Hair', parent_package_id: 'pkg-1' })],
      error: null,
    });
    render(<ServiceMenuEditor providerId="pp-1" />);
    expect(await screen.findByText('Add-on to Full Detail')).toBeTruthy();
  });

  // One level deep: a service that already has add-ons cannot become one.
  it('keeps a service with add-ons a main service', async () => {
    mockGetOwn.mockResolvedValue({
      data: [makePkg(), makePkg({ id: 'pkg-2', name: 'Pet Hair', parent_package_id: 'pkg-1' })],
      error: null,
    });
    render(<ServiceMenuEditor providerId="pp-1" />);
    await screen.findByText('Add-on to Full Detail');
    fireEvent.press(screen.getByLabelText('Edit Full Detail'));
    expect(screen.queryByTestId('service-parent-none')).toBeNull();
    expect(screen.getByText('This service has add-ons of its own, so it stays a main service.')).toBeTruthy();
  });

  it('keeps cents intact through a price round-trip', async () => {
    mockGetOwn.mockResolvedValue({ data: [makePkg({ base_price: 69.99 })], error: null });
    mockUpdate.mockResolvedValue({ data: makePkg(), error: null });
    render(<ServiceMenuEditor providerId="pp-1" />);
    await screen.findByText('$69.99 · 120 min');
    fireEvent.press(screen.getByLabelText('Edit Full Detail'));
    // The editor prefills dollars, not a cents value read as dollars.
    expect(screen.getByTestId('field-Price (USD)').props.value).toBe('69.99');
    await act(async () => {
      fireEvent.press(screen.getByTestId('service-save'));
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      'pkg-1',
      expect.objectContaining({ base_price: 69.99 }),
    );
  });

  it('marks unapproved packages as pending review', async () => {
    mockGetOwn.mockResolvedValue({ data: [makePkg({ is_approved: false })], error: null });
    render(<ServiceMenuEditor providerId="pp-1" />);
    expect(await screen.findByText('Pending review')).toBeTruthy();
  });
});
