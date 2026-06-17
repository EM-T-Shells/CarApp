// [threadId].test.tsx — unit tests for the message thread view (Flow 3.5):
// message rendering, sending (moderated insertMessage), and realtime
// subscribe/cleanup.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockGetMessages = jest.fn();
const mockGetThreadById = jest.fn();
jest.mock('../../../../src/lib/supabase/queries', () => ({
  getMessages: (...a: unknown[]) => mockGetMessages(...a),
  getThreadById: (...a: unknown[]) => mockGetThreadById(...a),
}));

const mockInsertMessage = jest.fn();
jest.mock('../../../../src/lib/supabase/mutations', () => ({
  insertMessage: (...a: unknown[]) => mockInsertMessage(...a),
}));

const channelToken = { __t: 'channel' };
const mockOn = jest.fn();
const mockSubscribe = jest.fn((..._a: unknown[]) => channelToken);
const channelBuilder = { on: mockOn, subscribe: mockSubscribe };
mockOn.mockReturnValue(channelBuilder);
const mockChannel = jest.fn((..._a: unknown[]) => channelBuilder);
const mockRemoveChannel = jest.fn((..._a: unknown[]) => undefined);
jest.mock('../../../../src/lib/supabase/client', () => ({
  supabase: {
    channel: (...a: unknown[]) => mockChannel(...a),
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

const mockUser = { id: 'user-1', full_name: 'Me', avatar_url: null };
jest.mock('../../../../src/state/auth', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: mockUser }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ threadId: 'thread-1' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return { Send: () => <View testID="icon-Send" /> };
});

jest.mock('../../../../src/components/ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../../../src/components/ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../../../src/components/ui/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View testID="avatar" /> };
});
jest.mock('../../../../src/utils/date', () => ({ formatTime: () => '10:00 AM' }));

const theirMessage = {
  id: 'm1',
  thread_id: 'thread-1',
  sender_id: 'provider-user',
  body: 'On my way!',
  image_url: null,
  is_read: true,
  is_flagged: false,
  sent_at: '2026-04-28T10:00:00Z',
  sender: { id: 'provider-user', full_name: 'Alex Smith', avatar_url: null },
};

import MessageThreadScreen from '../[threadId]';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetThreadById.mockResolvedValue({
    data: { provider_profiles: { users: { full_name: 'Alex Smith', avatar_url: null } } },
    error: null,
  });
  mockGetMessages.mockResolvedValue({ data: [theirMessage], error: null });
  mockInsertMessage.mockResolvedValue({
    data: {
      id: 'm2',
      thread_id: 'thread-1',
      sender_id: 'user-1',
      body: 'Sounds good',
      image_url: null,
      is_read: false,
      is_flagged: false,
      sent_at: '2026-04-28T10:05:00Z',
    },
    error: null,
  });
});

describe('MessageThreadScreen', () => {
  it('loads and renders existing messages', async () => {
    render(<MessageThreadScreen />);
    expect(await screen.findByText('On my way!')).toBeTruthy();
    expect(mockGetMessages).toHaveBeenCalledWith('thread-1');
  });

  it('subscribes to the thread realtime channel and cleans up on unmount', async () => {
    const view = render(<MessageThreadScreen />);
    await screen.findByText('On my way!');
    expect(mockChannel).toHaveBeenCalledWith('thread:thread-1');
    view.unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channelToken);
  });

  it('sends a message through the moderated insertMessage', async () => {
    render(<MessageThreadScreen />);
    await screen.findByText('On my way!');
    fireEvent.changeText(screen.getByTestId('message-input'), 'Sounds good');
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-send'));
    });
    expect(mockInsertMessage).toHaveBeenCalledWith({
      thread_id: 'thread-1',
      sender_id: 'user-1',
      body: 'Sounds good',
    });
    expect(await screen.findByText('Sounds good')).toBeTruthy();
  });

  it('does not send an empty/whitespace message', async () => {
    render(<MessageThreadScreen />);
    await screen.findByText('On my way!');
    fireEvent.changeText(screen.getByTestId('message-input'), '   ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('message-send'));
    });
    expect(mockInsertMessage).not.toHaveBeenCalled();
  });

  it('renders the error state when messages fail to load', async () => {
    mockGetMessages.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<MessageThreadScreen />);
    expect(await screen.findByText("Couldn't load messages")).toBeTruthy();
  });
});
