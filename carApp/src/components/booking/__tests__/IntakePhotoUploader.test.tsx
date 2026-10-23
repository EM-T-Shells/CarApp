import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockRequestLibrary = jest.fn();
const mockLaunchLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => mockRequestLibrary(...a),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunchLibrary(...a),
}));

const mockUpload = jest.fn();
const mockSign = jest.fn();
jest.mock('../../../lib/supabase/storage', () => ({
  uploadBookingPhoto: (...a: unknown[]) => mockUpload(...a),
  getSignedUrl: (...a: unknown[]) => mockSign(...a),
}));

const mockInsertPhoto = jest.fn();
jest.mock('../../../lib/supabase/mutations', () => ({
  insertBookingPhoto: (...a: unknown[]) => mockInsertPhoto(...a),
}));

import IntakePhotoUploader, { uploadIntakePhoto } from '../IntakePhotoUploader';

const PHOTO = { uri: 'file:///p.jpg', mimeType: 'image/jpeg', fileSize: 1234 };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ blob: async () => ({ size: 1234 }) })) as unknown as typeof fetch;
  mockUpload.mockResolvedValue({ data: 'b1/intake_1.jpeg', error: null });
  mockSign.mockResolvedValue({ data: 'https://signed', error: null });
  mockInsertPhoto.mockResolvedValue({ data: { id: 'ph1' }, error: null });
});

describe('uploadIntakePhoto', () => {
  // "booking_photos: customer insert intake" admits the customer only for
  // photo_type = 'intake'; anything else is refused by RLS.
  it('uploads to the booking path and records an intake row', async () => {
    const result = await uploadIntakePhoto('b1', PHOTO);

    expect(mockUpload).toHaveBeenCalledWith('b1', 'intake', expect.anything(), 'image/jpeg', 1234);
    expect(mockInsertPhoto).toHaveBeenCalledWith({
      booking_id: 'b1',
      photo_type: 'intake',
      storage_url: 'https://signed',
    });
    expect(result.data).toEqual({ id: 'ph1' });
  });

  it('stops at a failed upload without writing a row', async () => {
    mockUpload.mockResolvedValue({ data: null, error: new Error('too large') });
    const result = await uploadIntakePhoto('b1', PHOTO);
    expect(result.error?.message).toBe('too large');
    expect(mockInsertPhoto).not.toHaveBeenCalled();
  });

  it('turns a thrown fetch into an error result', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('no file');
    }) as unknown as typeof fetch;
    const result = await uploadIntakePhoto('b1', PHOTO);
    expect(result.error?.message).toBe('no file');
  });
});

describe('IntakePhotoUploader', () => {
  it('hands a picked photo to the host', async () => {
    mockRequestLibrary.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///p.jpg', mimeType: 'image/jpeg', fileSize: 1234 }],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onAdd = jest.fn();

    const { getByTestId } = render(<IntakePhotoUploader photos={[]} onAdd={onAdd} />);
    fireEvent.press(getByTestId('intake-add-photo'));

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Choose from Library')!.onPress!();
    });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(PHOTO));
  });

  it('stops offering to add at the limit', () => {
    const photos = [1, 2].map((n) => ({ key: `k${n}`, uri: `file:///${n}.jpg` }));
    const { queryByTestId, getByTestId } = render(
      <IntakePhotoUploader photos={photos} onAdd={jest.fn()} max={2} />,
    );
    expect(queryByTestId('intake-add-photo')).toBeNull();
    expect(getByTestId('intake-count').props.children).toEqual([2, ' of ', 2]);
  });

  it('removes only when the host allows it', () => {
    const photos = [{ key: 'k1', uri: 'file:///1.jpg' }];
    const onRemove = jest.fn();
    const { getByTestId, rerender, queryByTestId } = render(
      <IntakePhotoUploader photos={photos} onAdd={jest.fn()} onRemove={onRemove} />,
    );
    fireEvent.press(getByTestId('intake-remove-k1'));
    expect(onRemove).toHaveBeenCalledWith('k1');

    rerender(<IntakePhotoUploader photos={photos} onAdd={jest.fn()} />);
    expect(queryByTestId('intake-remove-k1')).toBeNull();
  });
});
