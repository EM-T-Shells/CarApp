// Message thread detail (Flow 3.5) — shows the message history for a thread,
// lets the customer send a new message (moderated in insertMessage before
// insert), and subscribes to Supabase Realtime so incoming messages append
// live. Channel naming + cleanup follow the CLAUDE.md realtime pattern.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Send } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Spacer } from '../../../src/components/ui/Spacer';
import { colors, borderRadius, spacing } from '../../../src/design/tokens';
import { fontFamilies, textStyles } from '../../../src/design/typography';
import { supabase } from '../../../src/lib/supabase/client';
import { useAuthStore } from '../../../src/state/auth';
import {
  getMessages,
  getThreadById,
  type MessageWithSender,
} from '../../../src/lib/supabase/queries';
import { insertMessage, isFlaggedContentError } from '../../../src/lib/supabase/mutations';
import { formatTime } from '../../../src/utils/date';
import type { MessageThreadParams } from '../../../src/types/navigation';

type Palette = (typeof colors)['light'] | (typeof colors)['dark'];

const FLAGGED_BODY = '[Message flagged for review]';

// ── Message bubble ─────────────────────────────────────────────────────────

interface BubbleProps {
  message: MessageWithSender;
  mine: boolean;
  palette: Palette;
  isDark: boolean;
}

function MessageBubble({ message, mine, palette, isDark }: BubbleProps): React.ReactElement {
  const flagged = message.is_flagged || message.body === FLAGGED_BODY;
  const senderName = message.sender?.full_name ?? 'Provider';

  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      {!mine ? (
        <>
          <Avatar uri={message.sender?.avatar_url} name={senderName} size="xs" />
          <Spacer size="xs" horizontal />
        </>
      ) : null}
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: palette.electricBlue }
            : { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
        ]}
      >
        <Text
          variant="body"
          style={[
            { color: mine ? '#FFFFFF' : palette.charcoal },
            flagged && styles.flaggedText,
          ]}
        >
          {message.body ?? ''}
        </Text>
        <Text
          variant="caption"
          style={[
            styles.timestamp,
            { color: mine ? 'rgba(255,255,255,0.7)' : palette.midGray },
          ]}
        >
          {message.sent_at ? formatTime(message.sent_at) : ''}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MessageThreadScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const insets = useSafeAreaInsets();

  const { threadId } = useLocalSearchParams<MessageThreadParams>();
  const user = useAuthStore((s) => s.user);

  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendWarning, setSendWarning] = useState<string | null>(null);

  const listRef = useRef<FlatList<MessageWithSender>>(null);

  // ── Load thread header + messages ──────────────────────────────────────
  const loadMessages = useCallback(async (): Promise<void> => {
    if (!threadId) return;
    const result = await getMessages(threadId);
    if (result.error) {
      setError(result.error);
    } else {
      setMessages(result.data ?? []);
      setError(null);
    }
  }, [threadId]);

  useEffect(() => {
    let active = true;
    if (!threadId) return;

    (async () => {
      setIsLoading(true);
      const [threadRes] = await Promise.all([getThreadById(threadId), loadMessages()]);
      if (!active) return;
      if (threadRes.data) {
        setTitle(threadRes.data.provider_profiles?.users?.full_name ?? 'Conversation');
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [threadId, loadMessages]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          // Refetch so the joined sender (name/avatar) is populated for the
          // incoming row rather than relying on the bare payload.
          loadMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, loadMessages]);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (!body || !user || !threadId || sending) return;

    setSending(true);
    setSendWarning(null);
    const result = await insertMessage({
      thread_id: threadId,
      sender_id: user.id,
      body,
    });
    setSending(false);

    if (result.error || !result.data) {
      // A flagged message is blocked outright — warn the sender inline and keep
      // the draft so they can edit it. Any other error also keeps the draft.
      if (isFlaggedContentError(result.error)) {
        setSendWarning(result.error.message);
      }
      return;
    }

    setDraft('');
    // Optimistically append our own message (realtime will reconcile by id).
    const sent: MessageWithSender = {
      ...result.data,
      sender: {
        id: user.id,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
      },
    };
    setMessages((prev) =>
      prev.some((m) => m.id === sent.id) ? prev : [...prev, sent],
    );
  }, [draft, user, threadId, sending]);

  const canSend = draft.trim().length > 0 && !sending;

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: palette.offWhite }]}>
        <Stack.Screen options={{ title: 'Conversation' }} />
        <ActivityIndicator size="large" color={palette.electricBlue} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: palette.offWhite }]}>
        <Stack.Screen options={{ title: title || 'Conversation' }} />
        <Text variant="subheading" color="charcoal">
          Couldn&apos;t load messages
        </Text>
        <Spacer size="sm" />
        <Pressable
          onPress={loadMessages}
          accessibilityRole="button"
          accessibilityLabel="Retry loading messages"
        >
          <Text variant="label" color="electricBlue">
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Stack.Screen options={{ title: title || 'Conversation' }} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.sender_id === user?.id}
            palette={palette}
            isDark={isDark}
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="sm" />}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text variant="body" color="midGray" style={styles.emptyText}>
              No messages yet. Say hello — keep all contact in-app.
            </Text>
          </View>
        }
      />

      {sendWarning ? (
        <View
          style={[styles.warningBanner, { backgroundColor: isDark ? '#3A1F1F' : '#FDECEC' }]}
          accessibilityRole="alert"
          testID="send-warning"
        >
          <Text variant="caption" style={styles.warningText}>
            {sendWarning}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            paddingBottom: Math.max(insets.bottom, spacing.sm),
            backgroundColor: isDark ? '#16161F' : '#FFFFFF',
            borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (sendWarning) setSendWarning(null);
          }}
          placeholder="Message"
          placeholderTextColor={palette.midGray}
          multiline
          style={[
            styles.input,
            {
              color: palette.charcoal,
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : palette.offWhite,
            },
          ]}
          accessibilityLabel="Message text"
          testID="message-input"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          testID="message-send"
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? palette.electricBlue : palette.midGray },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send size={18} color="#FFFFFF" strokeWidth={2} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.base,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
  },
  bubbleRowTheirs: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.card,
    gap: 2,
  },
  flaggedText: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
  timestamp: {
    alignSelf: 'flex-end',
  },
  emptyWrap: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 260,
  },
  warningBanner: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.input,
  },
  warningText: {
    color: '#D92B2B',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: borderRadius.input,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    fontFamily: fontFamilies.ui,
    fontSize: textStyles.body.fontSize,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
