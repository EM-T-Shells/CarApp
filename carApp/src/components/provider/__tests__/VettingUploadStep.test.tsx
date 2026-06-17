// VettingUploadStep.test.tsx — unit tests for the shared upload vetting step
// (used by the Insurance and Credentials screens).

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockGetProvider = jest.fn();
const mockGetVetting = jest.fn();
jest.mock('../../../lib/supabase/queries', () => ({
  getProviderByUserId: (...a: unknown[]) => mockGetProvider(...a),
  getProviderVetting: (...a: unknown[]) => mockGetVetting(...a),
}));

const mockUpdateVetting = jest.fn();
jest.mock('../../../lib/supabase/mutations', () => ({
  updateProviderVetting: (...a: unknown[]) => mockUpdateVetting(...a),
}));

const mockAuthUser = { id: 'user-1' };
jest.mock('../../../state/auth', () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: mockAuthUser }),
}));

// Mock the uploader to a button that immediately fires onUploaded.
jest.mock('../CredentialUpload', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    CredentialUpload: ({ label, onUploaded }: { label: string; onUploaded: (p: string) => void }) => (
      <TouchableOpacity testID="mock-upload" onPress={() => onUploaded('path/doc.jpg')}>
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});
jest.mock('../../ui/Card', () => {
  const { View } = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

import { VettingUploadStep } from '../VettingUploadStep';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProvider.mockResolvedValue({ data: { id: 'pp-1' }, error: null });
  mockGetVetting.mockResolvedValue({ data: { insurance_status: 'pending' }, error: null });
  mockUpdateVetting.mockResolvedValue({ data: true, error: null });
});

describe('VettingUploadStep', () => {
  it('renders the title and current status', async () => {
    render(
      <VettingUploadStep
        docLabel="insurance"
        statusField="insurance_status"
        title="Insurance"
        description="Upload it."
        uploadLabel="Upload insurance photo"
      />,
    );
    expect(await screen.findByText('Insurance')).toBeTruthy();
    expect(screen.getByText('Not submitted')).toBeTruthy();
  });

  it('sets the status to submitted after a successful upload', async () => {
    render(
      <VettingUploadStep
        docLabel="insurance"
        statusField="insurance_status"
        title="Insurance"
        description="Upload it."
        uploadLabel="Upload insurance photo"
      />,
    );
    await screen.findByTestId('mock-upload');
    await act(async () => {
      fireEvent.press(screen.getByTestId('mock-upload'));
    });
    expect(mockUpdateVetting).toHaveBeenCalledWith('pp-1', { insurance_status: 'submitted' });
    expect(await screen.findByText('Under review')).toBeTruthy();
  });
});
