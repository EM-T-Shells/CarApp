// (provider)/insurance.tsx — vetting Insurance step (Flow 4.4).
// Upload proof of current liability coverage; status moves to "Under review"
// for manual admin approval.

import React from 'react';
import { VettingUploadStep } from '../../src/components/provider/VettingUploadStep';

export default function InsuranceStep(): React.ReactElement {
  return (
    <VettingUploadStep
      docLabel="insurance"
      statusField="insurance_status"
      title="Insurance"
      description="Upload a photo of your current liability insurance so customers are covered. We'll review it and mark this step approved."
      uploadLabel="Upload insurance photo"
    />
  );
}
