// (provider)/identity.tsx — vetting Identity step (Flow 4.2).
//
// Manual government-ID photo upload is the working path today; automated Persona
// verification (src/lib/persona + persona-webhook) is stubbed pending the
// PERSONA_API_KEY / SDK setup. Either way the step lands in "Under review".

import React from 'react';
import { VettingUploadStep } from '../../src/components/provider/VettingUploadStep';

export default function IdentityStep(): React.ReactElement {
  return (
    <VettingUploadStep
      docLabel="identity"
      statusField="identity_status"
      title="Identity"
      description="Upload a clear photo of your government-issued ID. We use this to confirm your identity. (One-tap Persona verification is coming soon.)"
      uploadLabel="Upload a government ID"
    />
  );
}
