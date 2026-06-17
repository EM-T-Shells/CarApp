// LugThread.test.tsx — unit tests for the Lug AI conversation UI (Flow 3.6):
// greeting, send → edge-function call → reply, error fallback, the persistent
// human-escalation CTA and its promotion after two consecutive human requests.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockInvoke = jest.fn();
jest.mock('../../../lib/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } },
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { Bot: icon('Bot'), Headphones: icon('Headphones'), Send: icon('Send') };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});

import { LugThread, detectHumanHelpRequest } from '../LugThread';

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({ data: { reply: 'Sure! A full detail runs 2–4 hours.' }, error: null });
});

describe('detectHumanHelpRequest', () => {
  it('matches explicit human-help phrasings', () => {
    expect(detectHumanHelpRequest('I want to talk to a person')).toBe(true);
    expect(detectHumanHelpRequest('can I speak to a human')).toBe(true);
    expect(detectHumanHelpRequest('get me a support agent')).toBe(true);
  });
  it('does not match ordinary questions', () => {
    expect(detectHumanHelpRequest('how much is a wax?')).toBe(false);
  });
});

describe('LugThread', () => {
  it('renders the greeting and a persistent Talk to a person CTA', () => {
    render(<LugThread onTalkToPerson={jest.fn()} />);
    expect(screen.getByText(/I'm Lug/)).toBeTruthy();
    expect(screen.getByTestId('lug-talk-to-person')).toBeTruthy();
    expect(screen.getByText('Talk to a person')).toBeTruthy();
  });

  it('sends a message and appends the assistant reply', async () => {
    render(<LugThread onTalkToPerson={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('lug-input'), 'How long is a full detail?');
    await act(async () => {
      fireEvent.press(screen.getByTestId('lug-send'));
    });
    expect(mockInvoke).toHaveBeenCalledWith('lug-ai', {
      body: { messages: expect.any(Array) },
    });
    expect(await screen.findByText('Sure! A full detail runs 2–4 hours.')).toBeTruthy();
  });

  it('shows a graceful fallback when the edge function errors', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'not configured' } });
    render(<LugThread onTalkToPerson={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('lug-input'), 'hello');
    await act(async () => {
      fireEvent.press(screen.getByTestId('lug-send'));
    });
    expect(await screen.findByText(/trouble reaching my brain/)).toBeTruthy();
  });

  it('promotes the escalation CTA after two consecutive human-help requests', async () => {
    render(<LugThread onTalkToPerson={jest.fn()} />);
    const input = screen.getByTestId('lug-input');
    const send = screen.getByTestId('lug-send');

    fireEvent.changeText(input, 'I want to talk to a person');
    await act(async () => { fireEvent.press(send); });
    // Still secondary after one request.
    expect(screen.queryByText('Talk to a person now')).toBeNull();

    fireEvent.changeText(input, 'seriously, talk to a human');
    await act(async () => { fireEvent.press(send); });
    await waitFor(() => {
      expect(screen.getByText('Talk to a person now')).toBeTruthy();
    });
  });

  it('resets the escalation counter on a non-human-help message', async () => {
    render(<LugThread onTalkToPerson={jest.fn()} />);
    const input = screen.getByTestId('lug-input');
    const send = screen.getByTestId('lug-send');

    fireEvent.changeText(input, 'talk to a person');
    await act(async () => { fireEvent.press(send); });
    fireEvent.changeText(input, 'actually, how much is a wash?');
    await act(async () => { fireEvent.press(send); });
    fireEvent.changeText(input, 'talk to a person');
    await act(async () => { fireEvent.press(send); });
    // Only one consecutive human request → not yet primary.
    expect(screen.queryByText('Talk to a person now')).toBeNull();
  });

  it('invokes the escalation callback when the CTA is tapped', () => {
    const onTalk = jest.fn();
    render(<LugThread onTalkToPerson={onTalk} />);
    fireEvent.press(screen.getByTestId('lug-talk-to-person'));
    expect(onTalk).toHaveBeenCalledTimes(1);
  });
});
