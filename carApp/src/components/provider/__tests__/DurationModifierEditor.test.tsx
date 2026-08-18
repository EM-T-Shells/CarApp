import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DurationModifierEditor, {
  MAX_DELTA_MINS,
  MIN_DELTA_MINS,
  indexModifiers,
  parseDelta,
} from '../DurationModifierEditor';
import type { ServiceDurationModifier } from '../../../types/models';

function modifier(
  factorType: string,
  factorValue: string,
  deltaMins: number,
): ServiceDurationModifier {
  return {
    id: `${factorType}-${factorValue}`,
    provider_id: 'pp1',
    factor_type: factorType,
    factor_value: factorValue,
    delta_mins: deltaMins,
    delta_price: 0,
    created_at: '2026-08-20T00:00:00Z',
  };
}

// ── parseDelta ────────────────────────────────────────────────────────

describe('parseDelta', () => {
  it('reads a signed integer', () => {
    expect(parseDelta('30')).toBe(30);
    expect(parseDelta('-15')).toBe(-15);
    expect(parseDelta(' 45 ')).toBe(45);
  });

  it('rounds a decimal, since the column is an INT', () => {
    expect(parseDelta('30.6')).toBe(31);
  });

  // A lone minus is mid-typing, not a value.
  it('treats an empty or partial field as no opinion', () => {
    expect(parseDelta('')).toBeNull();
    expect(parseDelta('   ')).toBeNull();
    expect(parseDelta('-')).toBeNull();
    expect(parseDelta('abc')).toBeNull();
  });

  // Clamped to service_duration_modifiers_delta_mins_check, so a typo is a
  // clamped value rather than a 23514 the provider has to decode.
  it('clamps to the range the CHECK constraint allows', () => {
    expect(parseDelta('9000')).toBe(MAX_DELTA_MINS);
    expect(parseDelta('-9000')).toBe(MIN_DELTA_MINS);
  });
});

describe('indexModifiers', () => {
  it('keys by factor type and value together', () => {
    const index = indexModifiers([
      modifier('size_class', 'suv', 30),
      modifier('soil_level', 'heavy', 45),
    ]);
    expect(index['size_class:suv'].delta_mins).toBe(30);
    expect(index['soil_level:heavy'].delta_mins).toBe(45);
    expect(index['size_class:sedan']).toBeUndefined();
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('DurationModifierEditor', () => {
  it('offers a field for every factor value in the vocabulary', () => {
    const { getByTestId } = render(
      <DurationModifierEditor modifiers={[]} onChange={() => {}} />,
    );
    expect(getByTestId('modifier-size_class:suv')).toBeTruthy();
    expect(getByTestId('modifier-size_class:oversized')).toBeTruthy();
    expect(getByTestId('modifier-soil_level:heavy')).toBeTruthy();
    expect(getByTestId('modifier-pets:frequent')).toBeTruthy();
    expect(getByTestId('modifier-stains:some')).toBeTruthy();
  });

  it('shows an existing delta and leaves unset factors blank', () => {
    const { getByTestId } = render(
      <DurationModifierEditor
        modifiers={[modifier('size_class', 'suv', 30)]}
        onChange={() => {}}
      />,
    );
    expect(getByTestId('modifier-size_class:suv').props.value).toBe('30');
    expect(getByTestId('modifier-size_class:sedan').props.value).toBe('');
  });

  // Committed on blur, not per keystroke: a half-typed "-" or "1" must not
  // round-trip to the database.
  it('commits on blur, not while typing', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor modifiers={[]} onChange={onChange} />,
    );

    const field = getByTestId('modifier-size_class:suv');
    fireEvent.changeText(field, '3');
    fireEvent.changeText(field, '30');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(field, 'blur');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('size_class', 'suv', 30);
  });

  it('reports a negative delta, since a compact really is quicker', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor modifiers={[]} onChange={onChange} />,
    );

    const field = getByTestId('modifier-size_class:compact');
    fireEvent.changeText(field, '-15');
    fireEvent(field, 'blur');

    expect(onChange).toHaveBeenCalledWith('size_class', 'compact', -15);
  });

  // A zero row says "no different from the base", which is what having no row
  // already says — so it clears instead of storing noise.
  it('clears an existing factor when the field is emptied', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor
        modifiers={[modifier('size_class', 'suv', 30)]}
        onChange={onChange}
      />,
    );

    const field = getByTestId('modifier-size_class:suv');
    fireEvent.changeText(field, '');
    fireEvent(field, 'blur');

    expect(onChange).toHaveBeenCalledWith('size_class', 'suv', null);
  });

  it('clears rather than storing an explicit zero', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor
        modifiers={[modifier('size_class', 'suv', 30)]}
        onChange={onChange}
      />,
    );

    const field = getByTestId('modifier-size_class:suv');
    fireEvent.changeText(field, '0');
    fireEvent(field, 'blur');

    expect(onChange).toHaveBeenCalledWith('size_class', 'suv', null);
  });

  it('does not write when a blank field is left blank', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor modifiers={[]} onChange={onChange} />,
    );

    const field = getByTestId('modifier-size_class:van');
    fireEvent.changeText(field, '');
    fireEvent(field, 'blur');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not write when the value is unchanged', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor
        modifiers={[modifier('size_class', 'suv', 30)]}
        onChange={onChange}
      />,
    );

    const field = getByTestId('modifier-size_class:suv');
    fireEvent.changeText(field, '30');
    fireEvent(field, 'blur');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not write for a field that was never touched', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DurationModifierEditor modifiers={[]} onChange={onChange} />,
    );

    fireEvent(getByTestId('modifier-pets:none'), 'blur');
    expect(onChange).not.toHaveBeenCalled();
  });
});
