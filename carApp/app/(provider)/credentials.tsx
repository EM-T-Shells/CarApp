// (provider)/credentials.tsx — vetting Credentials step (Flow 4.5).
// Upload trade credentials (e.g. IDA / ASE certifications); status moves to
// "Under review" for manual admin approval.

import React from 'react';
import { VettingUploadStep } from '../../src/components/provider/VettingUploadStep';

export default function CredentialsStep(): React.ReactElement {
  return (
    <VettingUploadStep
      docLabel="credential"
      statusField="credentials_status"
      title="Credentials"
      description="Upload any certifications or trade credentials (e.g. IDA or ASE). These are optional but help you stand out and earn customer trust."
      uploadLabel="Upload a credential"
    />
  );
}
