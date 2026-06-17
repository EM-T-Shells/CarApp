// JobPhotoCapture.test.tsx — unit tests for the provider before/after photo
// uploader (Flow 5.5).

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockRequestCamera = jest.fn();
const mockRequestLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
const mockLaunchLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: () => mockRequestCamera(),
  requestMediaLibraryPermissionsAsync: () => mockRequestLibrary(),
  launchCameraAsync: () => mockLaunchCamera(),
  launchImageLibraryAsync: () => mockLaunchLibrary(),
}));

const mockUploadPhoto = jest.fn();
const mockGetSignedUrl = jest.fn();
jest.mock('../../../lib/supabase/storage', () => ({
  uploadBookingPhoto: (...a: unknown[]) => mockUploadPhoto(...a),
  getSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a),
}));

const mockInsertPhoto = jest.fn();
jest.mock('../../../lib/supabase/mutations', () => ({
  insertBookingPhoto: (...a: unknown[]) => mockInsertPhoto(...a),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (n: string) => () => <View testID={`icon-${n}`} />;
  return { Camera: icon('Camera'), Plus: icon('Plus') };
});
jest.mock('../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text: ({ children, ...p }: { children: React.ReactNode }) => <Text {...p}>{children}</Text> };
});
jest.mock('../../ui/Spacer', () => {
  const { View } = require('react-native');
  return { Spacer: () => <View /> };
});

import { JobPhotoCapture } from '../JobPhotoCapture';

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestCamera.mockResolvedValue({ granted: true });
  mockRequestLibrary.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://before.jpg', mimeType: 'image/jpeg', fileSize: 4096 }],
  });
  mockUploadPhoto.mockResolvedValue({ data: 'booking-1/before_1.jpg', error: null });
  mockGetSignedUrl.mockResolvedValue({ data: 'https://signed.example/before.jpg', error: null });
  mockInsertPhoto.mockResolvedValue({ data: { id: 'photo-1' }, error: null });
  global.fetch = jest
    .fn()
    .mockResolvedValue({ blob: async () => ({ size: 4096 }) }) as unknown as typeof fetch;
  // Auto-pick "Take Photo" from the source action sheet.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const take = (buttons ?? []).find((b) => b.text === 'Take Photo');
    take?.onPress?.();
  });
});

describe('JobPhotoCapture', () => {
  it('captures, uploads, signs, and records a before photo', async () => {
    const onChanged = jest.fn();
    render(<JobPhotoCapture bookingId="booking-1" photos={[]} onChanged={onChanged} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-before-photo'));
    });

    await waitFor(() => {
      expect(mockUploadPhoto).toHaveBeenCalledWith(
        'booking-1',
        'before',
        { size: 4096 },
        'image/jpeg',
        4096,
      );
    });
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      'booking-photos',
      'booking-1/before_1.jpg',
      expect.any(Number),
    );
    expect(mockInsertPhoto).toHaveBeenCalledWith({
      booking_id: 'booking-1',
      photo_type: 'before',
      storage_url: 'https://signed.example/before.jpg',
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not upload when camera permission is denied', async () => {
    mockRequestCamera.mockResolvedValue({ granted: false });
    const onChanged = jest.fn();
    render(<JobPhotoCapture bookingId="booking-1" photos={[]} onChanged={onChanged} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-after-photo'));
    });

    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('does not launch the picker when disabled', async () => {
    const onChanged = jest.fn();
    render(
      <JobPhotoCapture bookingId="booking-1" photos={[]} onChanged={onChanged} disabled />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-before-photo'));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockLaunchCamera).not.toHaveBeenCalled();
  });
});
