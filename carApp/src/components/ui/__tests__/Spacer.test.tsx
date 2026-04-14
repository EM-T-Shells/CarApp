// Spacer.test.tsx — unit tests for Spacer layout utility.

import React from 'react';
import { render } from '@testing-library/react-native';
import { Spacer } from '../Spacer';
import { spacing } from '../../../design/tokens';

describe('Spacer component', () => {
  // ─── Default Rendering ───────────────────────────────────────────────────────

  it('renders without error', () => {
    const { toJSON } = render(<Spacer />);
    expect(toJSON()).toBeTruthy();
  });

  it('defaults to vertical spacing using the "base" token', () => {
    const { toJSON } = render(<Spacer />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ height: spacing.base });
  });

  // ─── Named Token Sizes ───────────────────────────────────────────────────────

  const tokenCases = Object.entries(spacing) as [keyof typeof spacing, number][];

  tokenCases.forEach(([token, pixels]) => {
    it(`applies correct height for token "${token}" (${pixels}px)`, () => {
      const { toJSON } = render(<Spacer size={token} />);
      const view = toJSON() as { props: { style: object } };
      expect(view.props.style).toMatchObject({ height: pixels });
    });
  });

  // ─── Exact Pixel Value ───────────────────────────────────────────────────────

  it('accepts an exact pixel number as size', () => {
    const { toJSON } = render(<Spacer size={42} />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ height: 42 });
  });

  // ─── Horizontal Mode ─────────────────────────────────────────────────────────

  it('applies width instead of height when horizontal is true', () => {
    const { toJSON } = render(<Spacer size="xl" horizontal />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ width: spacing.xl });
  });

  it('applies correct width for exact pixel value when horizontal', () => {
    const { toJSON } = render(<Spacer size={20} horizontal />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ width: 20 });
  });

  // ─── Flex Mode ───────────────────────────────────────────────────────────────

  it('applies flex: 1 when flex prop is true', () => {
    const { toJSON } = render(<Spacer flex />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ flex: 1 });
  });

  it('flex prop overrides size', () => {
    const { toJSON } = render(<Spacer flex size="5xl" />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ flex: 1 });
    expect(view.props.style).not.toMatchObject({ height: spacing['5xl'] });
  });

  it('flex prop overrides horizontal', () => {
    const { toJSON } = render(<Spacer flex horizontal />);
    const view = toJSON() as { props: { style: object } };
    expect(view.props.style).toMatchObject({ flex: 1 });
  });
});
