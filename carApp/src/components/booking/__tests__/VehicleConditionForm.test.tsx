import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import VehicleConditionForm from '../VehicleConditionForm';
import type { ConditionAnswers } from '../../../utils/suggestion';

const noop = () => {};

function setup(
  overrides: Partial<React.ComponentProps<typeof VehicleConditionForm>> = {},
) {
  const props = {
    sizeClass: null,
    answers: {} as ConditionAnswers,
    onChangeSizeClass: noop,
    onChangeAnswer: noop,
    ...overrides,
  };
  return { ...render(<VehicleConditionForm {...props} />), props };
}

describe('VehicleConditionForm', () => {
  it('asks all four questions', () => {
    const { getByText } = setup();
    expect(getByText('Vehicle size')).toBeTruthy();
    expect(getByText('How is the interior?')).toBeTruthy();
    expect(getByText('Do kids or pets ride in it?')).toBeTruthy();
    expect(getByText('Any stains, smoke or pet hair?')).toBeTruthy();
  });

  it('offers every size class the CHECK constraint allows', () => {
    const { getByTestId } = setup();
    for (const size of [
      'compact',
      'sedan',
      'suv',
      'truck',
      'van',
      'oversized',
    ]) {
      expect(getByTestId(`size-class-${size}`)).toBeTruthy();
    }
  });

  it('reports the selected size class', () => {
    const onChangeSizeClass = jest.fn();
    const { getByTestId } = setup({ onChangeSizeClass });

    fireEvent.press(getByTestId('size-class-truck'));
    expect(onChangeSizeClass).toHaveBeenCalledWith('truck');
  });

  it('reports each condition answer under its own question key', () => {
    const onChangeAnswer = jest.fn();
    const { getByTestId } = setup({ onChangeAnswer });

    fireEvent.press(getByTestId('soil-level-heavy'));
    fireEvent.press(getByTestId('pets-frequent'));
    fireEvent.press(getByTestId('stains-none'));

    expect(onChangeAnswer).toHaveBeenNthCalledWith(1, 'soil_level', 'heavy');
    expect(onChangeAnswer).toHaveBeenNthCalledWith(2, 'pets', 'frequent');
    expect(onChangeAnswer).toHaveBeenNthCalledWith(3, 'stains', 'none');
  });

  it('marks the current answers as selected', () => {
    const { getByTestId } = setup({
      sizeClass: 'suv',
      answers: { soil_level: 'moderate' },
    });

    expect(getByTestId('size-class-suv').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByTestId('size-class-sedan').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(getByTestId('soil-level-moderate').props.accessibilityState).toEqual(
      { selected: true },
    );
  });

  // A pre-filled answer the customer cannot correct is worse than no pre-fill:
  // the duration is quoted against it.
  it('says where a pre-filled size came from, and still lets it change', () => {
    const onChangeSizeClass = jest.fn();
    const { getByText, getByTestId } = setup({
      sizeClass: 'sedan',
      sizePrefilled: true,
      onChangeSizeClass,
    });

    expect(
      getByText('From your saved vehicle — change it if this is not right.'),
    ).toBeTruthy();
    fireEvent.press(getByTestId('size-class-van'));
    expect(onChangeSizeClass).toHaveBeenCalledWith('van');
  });

  it('explains why size matters when nothing was pre-filled', () => {
    const { getByText } = setup();
    expect(
      getByText('Bigger vehicles take longer, so this affects your estimate.'),
    ).toBeTruthy();
  });

  it('leaves unanswered questions unselected rather than defaulting one', () => {
    const { getByTestId } = setup();
    for (const level of ['light', 'moderate', 'heavy']) {
      expect(
        getByTestId(`soil-level-${level}`).props.accessibilityState,
      ).toEqual({ selected: false });
    }
  });
});
