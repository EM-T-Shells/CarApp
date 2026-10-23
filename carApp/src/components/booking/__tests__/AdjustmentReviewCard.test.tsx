import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AdjustmentReviewCard from '../AdjustmentReviewCard';

function setup() {
  const onApprove = jest.fn();
  const onDecline = jest.fn();
  const view = render(
    <AdjustmentReviewCard
      providerName="Dana"
      reason="Mud throughout the interior"
      currentTotalCents={25500}
      adjustedTotalCents={28500}
      currentDurationMins={120}
      adjustedDurationMins={180}
      lines={[{ label: 'Heavy mud', amount_cents: 3000 }]}
      onApprove={onApprove}
      onDecline={onDecline}
    />,
  );
  return { ...view, onApprove, onDecline };
}

describe('AdjustmentReviewCard', () => {
  it('shows the server total, the reason and each new charge', () => {
    const { getByTestId, getByText } = setup();
    expect(getByTestId('adjustment-new-total').props.children).toBe('$285.00');
    expect(getByText('“Mud throughout the interior”')).toBeTruthy();
    expect(getByText('Heavy mud')).toBeTruthy();
    expect(getByText('+$30.00')).toBeTruthy();
    expect(getByText('2 hr → 3 hr')).toBeTruthy();
  });

  // Declining cancels the booking; the button must say so rather than hide it.
  it('names the consequence of declining', () => {
    const { getByText } = setup();
    expect(getByText('Decline & Cancel Booking')).toBeTruthy();
    expect(getByText('Declining cancels the booking and refunds your deposit in full.')).toBeTruthy();
  });

  it('wires both answers', () => {
    const { getByTestId, onApprove, onDecline } = setup();
    fireEvent.press(getByTestId('adjustment-approve'));
    fireEvent.press(getByTestId('adjustment-decline'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
