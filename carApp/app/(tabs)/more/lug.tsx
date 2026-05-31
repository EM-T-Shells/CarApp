// Lug full-screen view (Flow 3.6) — hosts the LugThread conversation and wires
// the human-escalation hand-off: "Talk to a person" opens a support thread in
// the inbox (a message_threads row with no provider attached) and navigates to
// it. Lug history itself is ephemeral (not persisted).

import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { LugThread } from '../../../src/components/lug/LugThread';
import { useAuthStore } from '../../../src/state/auth';
import { insertMessageThread } from '../../../src/lib/supabase/mutations';

export default function LugScreen(): React.ReactElement {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const handleTalkToPerson = useCallback(async (): Promise<void> => {
    if (!user) {
      router.push('/(tabs)/inbox');
      return;
    }
    // Open a support conversation (no provider attached). A future improvement
    // is to reuse an existing open support thread instead of always creating one.
    const result = await insertMessageThread({
      customer_id: user.id,
      provider_id: null,
      booking_id: null,
    });
    if (result.error || !result.data) {
      router.push('/(tabs)/inbox');
      return;
    }
    router.push(`/(tabs)/inbox/${result.data.id}`);
  }, [user, router]);

  return <LugThread onTalkToPerson={handleTalkToPerson} />;
}
