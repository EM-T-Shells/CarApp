// CredentialUpload.test.tsx — unit tests for the vetting document uploader.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockRequestPerm = jest.fn();
const mockLaunch = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestPerm(),
  launchImageLibraryAsync: () => mockLaunch(),
}));

const mockUpload = jest.fn();
jest.mock('../../../lib/supabase/storage', () => ({
  uploadVettingDocument: (...a: unknown[]) => mockUpload(...a),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { Check: icon('Check'), Upload: icon('Upload') };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});

import { CredentialUpload } from '../CredentialUpload';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPerm.mockResolvedValue({ granted: true });
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://doc.jpg', mimeType: 'image/jpeg', fileSize: 2048 }],
  });
  mockUpload.mockResolvedValue({ data: 'user-1/insurance_1.jpg', error: null });
  global.fetch = jest
    .fn()
    .mockResolvedValue({ blob: async () => ({ size: 2048 }) }) as unknown as typeof fetch;
});

describe('CredentialUpload', () => {
  it('blocks upload when permission is denied', async () => {
    mockRequestPerm.mockResolvedValue({ granted: false });
    const onUploaded = jest.fn();
    render(<CredentialUpload userId="user-1" docLabel="insurance" label="Upload" onUploaded={onUploaded} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-insurance'));
    });
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('uploads the picked image and reports the stored path', async () => {
    const onUploaded = jest.fn();
    render(<CredentialUpload userId="user-1" docLabel="insurance" label="Upload" onUploaded={onUploaded} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('upload-insurance'));
    });
    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith('user-1', 'insurance', { size: 2048 }, 'image/jpeg', 2048);
    });
    expect(onUploaded).toHaveBeenCalledWith('user-1/insurance_1.jpg');
  });
});
