import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TimezoneField, {
  COMMON_TIMEZONES,
  shortZoneLabel,
  timezoneOptions,
} from '../TimezoneField';

describe('shortZoneLabel', () => {
  it('takes the last path segment and unescapes underscores', () => {
    expect(shortZoneLabel('America/New_York')).toBe('New York');
    expect(shortZoneLabel('America/Argentina/Buenos_Aires')).toBe(
      'Buenos Aires',
    );
  });

  it('passes a bare zone through', () => {
    expect(shortZoneLabel('UTC')).toBe('UTC');
  });
});

describe('timezoneOptions', () => {
  it('offers the common zones unchanged when the current one is among them', () => {
    expect(timezoneOptions('America/Chicago')).toHaveLength(
      COMMON_TIMEZONES.length,
    );
  });

  // Replacing rather than appending would present a different zone as the
  // provider's setting, and save it on the next tap.
  it('appends an unlisted current zone so it can stay selected', () => {
    const options = timezoneOptions('Europe/Lisbon');
    expect(options).toHaveLength(COMMON_TIMEZONES.length + 1);
    expect(options[options.length - 1]).toEqual({
      value: 'Europe/Lisbon',
      label: 'Lisbon',
    });
  });

  it('does not append an empty current zone', () => {
    expect(timezoneOptions('')).toHaveLength(COMMON_TIMEZONES.length);
  });
});

describe('TimezoneField', () => {
  it('marks the current zone as selected', () => {
    const { getByLabelText } = render(
      <TimezoneField value="America/Chicago" onChange={() => {}} />,
    );
    expect(getByLabelText('Central time').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabelText('Eastern time').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('reports the IANA identifier, not the friendly label', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <TimezoneField value="America/New_York" onChange={onChange} />,
    );

    fireEvent.press(getByLabelText('Mountain time'));
    expect(onChange).toHaveBeenCalledWith('America/Denver');
  });

  it('shows an unlisted stored zone as an option', () => {
    const { getByLabelText } = render(
      <TimezoneField value="Europe/Lisbon" onChange={() => {}} />,
    );
    expect(getByLabelText('Lisbon time').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
