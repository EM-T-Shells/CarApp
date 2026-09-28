import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View testID="sheet">{children}</View> : null,
  };
});

// The native picker is replaced by a button that picks a fixed new time.
const NEW_TIME = '2026-10-02T15:00:00.000Z';
jest.mock('../DateTimePicker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    DateTimePicker: ({ onChange }: { onChange: (iso: string) => void }) => (
      <Pressable testID="pick-time" onPress={() => onChange(NEW_TIME)}>
        <Text>pick</Text>
      </Pressable>
    ),
  };
});

import { RescheduleProposalCard, RescheduleSheet } from '../RescheduleProposal';

const CURRENT = '2026-10-01T15:00:00.000Z';

describe('RescheduleSheet', () => {
  it('cannot propose the time the booking is already at', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <RescheduleSheet
        visible
        onClose={jest.fn()}
        currentScheduledAt={CURRENT}
        otherPartyLabel="Dana"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('reschedule-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('proposes the picked time', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <RescheduleSheet
        visible
        onClose={jest.fn()}
        currentScheduledAt={CURRENT}
        otherPartyLabel="Dana"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('pick-time'));
    fireEvent.press(getByTestId('reschedule-submit'));
    expect(onSubmit).toHaveBeenCalledWith(NEW_TIME);
  });
});

describe('RescheduleProposalCard', () => {
  const handlers = () => ({
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onWithdraw: jest.fn(),
  });

  it('lets the other party accept or decline', () => {
    const h = handlers();
    const { getByTestId, queryByTestId } = render(
      <RescheduleProposalCard proposedAt={NEW_TIME} proposedByViewer={false} otherPartyLabel="Dana" {...h} />,
    );
    fireEvent.press(getByTestId('reschedule-accept'));
    fireEvent.press(getByTestId('reschedule-decline'));
    expect(h.onAccept).toHaveBeenCalled();
    expect(h.onDecline).toHaveBeenCalled();
    expect(queryByTestId('reschedule-withdraw')).toBeNull();
  });

  // Accepting your own proposal would be the one-sided reschedule this exists
  // to prevent; the proposer only gets to withdraw.
  it('only lets the proposer withdraw', () => {
    const h = handlers();
    const { getByTestId, queryByTestId } = render(
      <RescheduleProposalCard proposedAt={NEW_TIME} proposedByViewer otherPartyLabel="Dana" {...h} />,
    );
    expect(queryByTestId('reschedule-accept')).toBeNull();
    fireEvent.press(getByTestId('reschedule-withdraw'));
    expect(h.onWithdraw).toHaveBeenCalled();
  });
});
