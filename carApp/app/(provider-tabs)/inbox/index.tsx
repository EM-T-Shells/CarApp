// Provider Inbox tab (Section 5) — lists the message threads for the signed-in
// provider's incoming job conversations. Tapping a row opens the shared thread
// detail screen in the customer group (it keys off the authenticated user, so
// the same screen serves both sides).
//
// Note: the thread summary query joins only the provider's own user (not the
// customer), so rows are labeled by their booking context (status + date)
// rather than a customer name. Surfacing the customer name is a future query
// enhancement, intentionally out of scope here.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, MessageSquare } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, spacing } from '../../../src/design/tokens';
import { useAuthStore } from '../../../src/state/auth';
import {
  getThreadsForProvider,
  getProviderByUserId,
  type MessageThreadSummary,
} from '../../../src/lib/supabase/queries';
import { formatShortDate } from '../../../src/utils/date';

type Palette = (typeof colors)['light'] | (typeof colors)['dark'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  pending_provider_approval: 'Action needed',
  confirmed: 'Confirmed',
  en_route: 'En route',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function threadTitle(thread: MessageThreadSummary): string {
  const booking = thread.bookings;
  if (booking?.scheduled_at) {
    return `Job · ${formatShortDate(booking.scheduled_at)}`;
  }
  return 'Customer conversation';
}

function threadSubtitle(thread: MessageThreadSummary): string {
  const booking = thread.bookings;
  if (!booking) return 'Conversation';
  return STATUS_LABELS[booking.status] ?? booking.status;
}

// ── Thread row ─────────────────────────────────────────────────────────────

interface ThreadRowProps {
  thread: MessageThreadSummary;
  palette: Palette;
  onPress: () => void;
}

function ThreadRow({ thread, palette, onPress }: ThreadRowProps): React.ReactElement {
  const title = threadTitle(thread);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Conversation: ${title}`}
      accessibilityHint="Tap to open the conversation"
    >
      <View style={styles.row}>
        <Avatar name="Customer" size="md" />
        <Spacer size="md" horizontal />
        <View style={styles.flex}>
          <Text variant="label" color="charcoal" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color="midGray" numberOfLines={1}>
            {threadSubtitle(thread)}
          </Text>
        </View>
        <ChevronRight size={18} color={palette.midGray} strokeWidth={2} />
      </View>
    </Card>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function ProviderInboxScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const user = useAuthStore((s) => s.user);

  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const providerIdRef = useRef<string | null>(null);

  const fetchThreads = useCallback(
    async (refresh = false): Promise<void> => {
      if (!user) return;
      if (!refresh) setIsLoading(true);
      setError(null);

      if (!providerIdRef.current) {
        const { data: profile, error: profileError } = await getProviderByUserId(
          user.id,
        );
        if (profileError || !profile) {
          setError(profileError ?? new Error('Provider profile not found'));
          setIsLoading(false);
          return;
        }
        providerIdRef.current = profile.id;
      }
      const result = await getThreadsForProvider(providerIdRef.current);
      if (result.error) setError(result.error);
      else setThreads(result.data ?? []);
      setIsLoading(false);
    },
    [user],
  );

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchThreads(true).finally(() => setIsRefreshing(false));
  }, [fetchThreads]);

  const renderItem = useCallback(
    ({ item }: { item: MessageThreadSummary }) => (
      <ThreadRow
        thread={item}
        palette={palette}
        onPress={() => router.push(`/(tabs)/inbox/${item.id}`)}
      />
    ),
    [palette, router],
  );

  const header = (
    <View style={styles.header}>
      <Text variant="heading" color="charcoal">
        Inbox
      </Text>
    </View>
  );

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.electricBlue} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={palette.electricBlue}
            />
          }
        >
          <Text variant="subheading" color="charcoal">
            Couldn&apos;t load your inbox
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            Pull down to try again.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────
  if (threads.length === 0) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.offWhite }]}
        edges={['top']}
      >
        {header}
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={palette.electricBlue}
            />
          }
        >
          <MessageSquare size={48} color={palette.midGray} strokeWidth={1.5} />
          <Spacer size="md" />
          <Text variant="subheading" color="charcoal">
            No messages yet
          </Text>
          <Spacer size="sm" />
          <Text variant="body" color="midGray" style={styles.centeredText}>
            When a customer books you, your conversation will appear here.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      {header}
      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="md" />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.electricBlue}
          />
        }
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  centeredText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
