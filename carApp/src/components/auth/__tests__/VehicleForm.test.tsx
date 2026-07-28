// VehicleForm.test.tsx — blur validation for the vehicle capture step.
//
// Guards the blur path specifically: as of React Native 0.83 `onBlur` delivers
// a BlurEvent whose nativeEvent no longer carries `text`, so the handler reads
// the committed draft value from the store instead of the event payload.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { VehicleForm } from '../VehicleForm';
import { useSignUpDraftStore } from '../../../state/signUpDraft';

beforeEach(() => {
  useSignUpDraftStore.getState().reset();
});

describe('VehicleForm blur validation', () => {
  it('surfaces an error when a required field is blurred while empty', () => {
    render(<VehicleForm />);

    // Blur with nothing typed — no event payload is consulted, so the error
    // must come from the empty value held in the draft store.
    fireEvent(screen.getByLabelText('Vehicle year'), 'blur');

    expect(useSignUpDraftStore.getState().vehicle.year).toBe('');
    expect(screen.getByLabelText('Vehicle year').props.accessibilityHint).toBeTruthy();
  });

  it('clears the error once a valid value is committed and re-blurred', () => {
    render(<VehicleForm />);

    const year = screen.getByLabelText('Vehicle year');
    fireEvent(year, 'blur');
    expect(screen.getByLabelText('Vehicle year').props.accessibilityHint).toBeTruthy();

    fireEvent.changeText(year, '2021');
    fireEvent(screen.getByLabelText('Vehicle year'), 'blur');

    expect(useSignUpDraftStore.getState().vehicle.year).toBe('2021');
    expect(
      screen.getByLabelText('Vehicle year').props.accessibilityHint,
    ).toBeUndefined();
  });

  it('validates the value in the store, not text carried on the event', () => {
    render(<VehicleForm />);

    const make = screen.getByLabelText('Vehicle make');
    fireEvent.changeText(make, 'Toyota');

    // Fire a bare blur with no nativeEvent.text — the old implementation read
    // `e.nativeEvent.text` and would throw or mis-validate here.
    fireEvent(screen.getByLabelText('Vehicle make'), 'blur');

    expect(useSignUpDraftStore.getState().vehicle.make).toBe('Toyota');
    expect(
      screen.getByLabelText('Vehicle make').props.accessibilityHint,
    ).toBeUndefined();
  });
});
