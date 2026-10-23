import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PackageSelector, { formatPriceRange } from '../PackageSelector';
import type { ServiceDurationModifier, ServicePackage } from '../../../types/models';

function pkg(overrides: Partial<ServicePackage> & { id: string }): ServicePackage {
  return {
    provider_id: 'pp1',
    catalog_id: null,
    name: overrides.id,
    description: null,
    category: 'detailing',
    base_price: 150,
    duration_mins: 120,
    duration_min_mins: null,
    duration_max_mins: null,
    tier: null,
    parent_package_id: null,
    is_active: true,
    is_custom: false,
    is_approved: true,
    sort_order: 0,
    created_at: '2026-09-28T00:00:00Z',
    ...overrides,
  };
}

function modifier(factor_type: string, delta_price: number): ServiceDurationModifier {
  return {
    id: `${factor_type}-${delta_price}`,
    provider_id: 'pp1',
    factor_type,
    factor_value: 'suv',
    delta_mins: 0,
    delta_price,
    created_at: '2026-09-28T00:00:00Z',
  };
}

const MAIN = pkg({
  id: 'detail',
  name: 'Full Detail',
  tier: 'premium',
  duration_min_mins: 120,
  duration_max_mins: 180,
});
const ADDON = pkg({ id: 'ceramic', name: 'Ceramic Boost', base_price: 40, parent_package_id: 'detail' });

describe('formatPriceRange', () => {
  it('collapses an empty range to one price', () => {
    expect(formatPriceRange({ minCents: 15000, maxCents: 15000 })).toBe('$150.00');
    expect(formatPriceRange({ minCents: 15000, maxCents: 18000 })).toBe('$150.00–$180.00');
  });
});

describe('PackageSelector', () => {
  it('shows a price range from the provider’s own surcharges', () => {
    const { getByTestId } = render(
      <PackageSelector
        packages={[MAIN]}
        modifiers={[modifier('size_class', 30)]}
        selectedIds={[]}
        onToggle={jest.fn()}
      />,
    );
    expect(getByTestId('package-price-detail').props.children).toBe('$150.00–$180.00');
  });

  it('shows the tier and the advertised duration range', () => {
    const { getByText } = render(
      <PackageSelector packages={[MAIN]} modifiers={[]} selectedIds={[]} onToggle={jest.fn()} />,
    );
    expect(getByText('Premium')).toBeTruthy();
    expect(getByText('2 hr–3 hr')).toBeTruthy();
  });

  // An add-on cannot be booked without its main service, so it is not even
  // offered until that service is chosen.
  it('hides add-ons until their main service is selected', () => {
    const { queryByTestId, rerender } = render(
      <PackageSelector packages={[MAIN, ADDON]} modifiers={[]} selectedIds={[]} onToggle={jest.fn()} />,
    );
    expect(queryByTestId('package-ceramic')).toBeNull();

    rerender(
      <PackageSelector
        packages={[MAIN, ADDON]}
        modifiers={[]}
        selectedIds={['detail']}
        onToggle={jest.fn()}
      />,
    );
    expect(queryByTestId('package-ceramic')).toBeTruthy();
    expect(queryByTestId('package-price-ceramic')?.props.children).toBe('+$40.00');
  });

  it('toggles the package it was given', () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <PackageSelector
        packages={[MAIN, ADDON]}
        modifiers={[]}
        selectedIds={['detail']}
        onToggle={onToggle}
      />,
    );
    fireEvent.press(getByTestId('package-ceramic'));
    expect(onToggle).toHaveBeenCalledWith(ADDON);
  });

  it('says so when there is nothing to book', () => {
    const { getByText } = render(
      <PackageSelector packages={[]} modifiers={[]} selectedIds={[]} onToggle={jest.fn()} />,
    );
    expect(getByText('This provider has no services available.')).toBeTruthy();
  });
});
