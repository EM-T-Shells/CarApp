import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import QuoteBuilder, {
  DURATION_STEP_MINS,
  dollarsToCents,
  startOptions,
  surchargeTotalCents,
  type QuoteDraft,
} from '../QuoteBuilder';
import {
  MAX_QUOTE_DURATION_MINS,
  MAX_QUOTE_LINE_ITEMS,
  MIN_QUOTE_DURATION_MINS,
} from '../../../../supabase/functions/_shared/quote';

// Jest pins TZ=UTC, so these are the wall-clock hours they look like.
const WINDOW = {
  start: '2026-10-14T12:00:00.000Z',
  end: '2026-10-14T16:00:00.000Z',
};

const BASE_DRAFT: QuoteDraft = {
  scheduledAt: null,
  durationMins: 120,
  lineItems: [],
};

function setup(overrides: Partial<React.ComponentProps<typeof QuoteBuilder>> = {}) {
  const onChange = jest.fn();
  const props = {
    window: WINDOW,
    baseTotalCents: 12000,
    draft: BASE_DRAFT,
    onChange,
    ...overrides,
  };
  return { ...render(<QuoteBuilder {...props} />), onChange, props };
}

describe('startOptions', () => {
  it('covers the window at half-hour steps, inclusive of both ends', () => {
    expect(startOptions(WINDOW)).toEqual([
      '2026-10-14T12:00:00.000Z',
      '2026-10-14T12:30:00.000Z',
      '2026-10-14T13:00:00.000Z',
      '2026-10-14T13:30:00.000Z',
      '2026-10-14T14:00:00.000Z',
      '2026-10-14T14:30:00.000Z',
      '2026-10-14T15:00:00.000Z',
      '2026-10-14T15:30:00.000Z',
      '2026-10-14T16:00:00.000Z',
    ]);
  });

  it('never offers a start outside the window', () => {
    // validateQuoteStart refuses those with a 400, so the control must not be
    // able to produce one.
    const starts = startOptions(WINDOW);
    const lo = new Date(WINDOW.start).getTime();
    const hi = new Date(WINDOW.end).getTime();
    for (const iso of starts) {
      const t = new Date(iso).getTime();
      expect(t).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    }
  });

  it('returns nothing for an inverted or unparseable window', () => {
    expect(startOptions({ start: WINDOW.end, end: WINDOW.start })).toEqual([]);
    expect(startOptions({ start: 'nope', end: 'nope' })).toEqual([]);
  });
});

describe('dollarsToCents', () => {
  it('converts a decimal string', () => {
    expect(dollarsToCents('12.50')).toBe(1250);
    expect(dollarsToCents('30')).toBe(3000);
  });

  it('is 0 rather than NaN for junk, so the total never renders as $NaN', () => {
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('abc')).toBe(0);
    expect(dollarsToCents('-5')).toBe(500); // sign stripped, not negative
  });

  it('strips currency symbols a provider may type', () => {
    expect(dollarsToCents('$30.00')).toBe(3000);
  });
});

describe('surchargeTotalCents', () => {
  it('sums the lines', () => {
    expect(
      surchargeTotalCents([
        { key: 'a', label: 'SUV', amountCents: 3000 },
        { key: 'b', label: 'Pet hair', amountCents: 2500 },
      ]),
    ).toBe(5500);
  });

  it('is 0 for no lines', () => {
    expect(surchargeTotalCents([])).toBe(0);
  });
});

describe('QuoteBuilder', () => {
  it('offers a start chip for every option in the window', () => {
    const { getByTestId } = setup();
    for (const iso of startOptions(WINDOW)) {
      expect(getByTestId(`quote-start-${iso}`)).toBeTruthy();
    }
  });

  it('reports the chosen start', () => {
    const { getByTestId, onChange } = setup();
    fireEvent.press(getByTestId('quote-start-2026-10-14T13:30:00.000Z'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: '2026-10-14T13:30:00.000Z' }),
    );
  });

  it('steps the duration up and down', () => {
    const { getByTestId, onChange } = setup();

    fireEvent.press(getByTestId('quote-duration-plus'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationMins: 120 + DURATION_STEP_MINS }),
    );

    fireEvent.press(getByTestId('quote-duration-minus'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ durationMins: 120 - DURATION_STEP_MINS }),
    );
  });

  it('clamps at the bounds prepareQuote enforces', () => {
    const atMin = setup({
      draft: { ...BASE_DRAFT, durationMins: MIN_QUOTE_DURATION_MINS },
    });
    fireEvent.press(atMin.getByTestId('quote-duration-minus'));
    expect(atMin.onChange).not.toHaveBeenCalled();

    const atMax = setup({
      draft: { ...BASE_DRAFT, durationMins: MAX_QUOTE_DURATION_MINS },
    });
    fireEvent.press(atMax.getByTestId('quote-duration-plus'));
    expect(atMax.onChange).not.toHaveBeenCalled();
  });

  it('adds and removes surcharge lines', () => {
    const { getByTestId, onChange } = setup();
    fireEvent.press(getByTestId('quote-add-item'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lineItems: [expect.objectContaining({ label: '' })] }),
    );

    const withItem = setup({
      draft: {
        ...BASE_DRAFT,
        lineItems: [{ key: 'k1', label: 'SUV', amountCents: 3000 }],
      },
    });
    fireEvent.press(withItem.getByTestId('quote-item-remove-k1'));
    expect(withItem.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lineItems: [] }),
    );
  });

  it('stops offering new lines at the server limit', () => {
    const full = Array.from({ length: MAX_QUOTE_LINE_ITEMS }, (_, i) => ({
      key: `k${i}`,
      label: `Item ${i}`,
      amountCents: 100,
    }));
    const { queryByTestId } = setup({
      draft: { ...BASE_DRAFT, lineItems: full },
    });
    expect(queryByTestId('quote-add-item')).toBeNull();
  });

  it('previews base plus surcharges', () => {
    const { getByTestId } = setup({
      draft: {
        ...BASE_DRAFT,
        lineItems: [
          { key: 'a', label: 'SUV', amountCents: 3000 },
          { key: 'b', label: 'Pet hair', amountCents: 2500 },
        ],
      },
    });
    // 12000 base + 5500 surcharges
    expect(getByTestId('quote-total').props.children).toContain('175.00');
  });

  it('says the server figure wins, because this one is only a preview', () => {
    const { getByText } = setup();
    expect(getByText(/server.s figure is the one the customer sees/i)).toBeTruthy();
  });

  it('surfaces a submit error inline', () => {
    const { getByText } = setup({ error: 'That start is outside the window' });
    expect(getByText('That start is outside the window')).toBeTruthy();
  });
});
