// LugThread (Flow 3.6) — the Lug AI conversation UI. Holds the chat locally
// (Lug history is not persisted to the DB) and calls the `lug-ai` Edge
// Function via supabase.functions.invoke for each turn.
//
// CLAUDE.md requirement: a persistent "Talk to a person" affordance must be
// visible without scrolling on every Lug surface, and after two consecutive
// turns where the user asks for human help it must become the PRIMARY action.
// That escalation logic lives here; the actual support-thread hand-off is
// delegated to the `onTalkToPerson` callback supplied by the host screen.
//
// NOTE: the `lug-ai` Edge Function itself is a stub until ANTHROPIC_API_KEY is
// set and the function is deployed — until then askLug returns an error and the
// UI surfaces a graceful message plus the (now-prominent) escalation CTA.

import React, { useCallback, useRef, useState } from 'react';
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
import { Bot, Headphones, Send } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, borderRadius, spacing } from '../../design/tokens';
import { fontFamilies, textStyles } from '../../design/typography';
import { supabase } from '../../lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────

export type LugRole = 'user' | 'assistant';

export interface LugMessage {
  id: string;
  role: LugRole;
  content: string;
}

export interface LugThreadProps {
  /**
   * Opens a human support thread in the inbox. Wired by the host screen
   * because it needs router + thread creation. Required so every Lug surface
   * can satisfy the human-escalation rule.
   */
  onTalkToPerson: () => void;
}

// Number of consecutive "I want a human" turns after which the escalation
// affordance is promoted to the primary action.
const ESCALATION_THRESHOLD = 2;

const GREETING: LugMessage = {
  id: 'lug-greeting',
  role: 'assistant',
  content:
    "Hi, I'm Lug 🔧 — ask me anything about car care, our services, or finding the right provider.",
};

// Heuristic for detecting an explicit request to speak with a human.
const HUMAN_HELP_PATTERN =
  /\b(human|real person|speak to (someone|a person)|talk to (someone|a person|a human)|customer service|support agent|representative|agent)\b/i;

export function detectHumanHelpRequest(text: string): boolean {
  return HUMAN_HELP_PATTERN.test(text);
}

// ── Edge Function call ─────────────────────────────────────────────────────

async function askLug(
  history: { role: LugRole; content: string }[],
): Promise<{ reply: string } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('lug-ai', {
      body: { messages: history },
    });
    if (error) return { error: error.message };
    const reply = (data as { reply?: string } | null)?.reply;
    if (!reply) return { error: 'Lug did not return a response.' };
    return { reply };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error.' };
  }
}

// ── Bubble ─────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  palette,
  isDark,
}: {
  message: LugMessage;
  palette: (typeof colors)['light'] | (typeof colors)['dark'];
  isDark: boolean;
}): React.ReactElement {
  const mine = message.role === 'user';
  return (
    <View
      style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}
    >
      {!mine ? (
        <View style={[styles.lugAvatar, { backgroundColor: palette.gearGold }]}>
          <Bot size={16} color="#FFFFFF" strokeWidth={2} />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: palette.electricBlue }
            : { backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF' },
        ]}
      >
        <Text variant="body" style={{ color: mine ? '#FFFFFF' : palette.charcoal }}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function LugThread({ onTalkToPerson }: LugThreadProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [messages, setMessages] = useState<LugMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [consecutiveHumanRequests, setConsecutiveHumanRequests] = useState(0);

  const listRef = useRef<FlatList<LugMessage>>(null);
  const counterRef = useRef(0);

  const escalationPrimary = consecutiveHumanRequests >= ESCALATION_THRESHOLD;

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleSend = useCallback(async (): Promise<void> => {
    const body = draft.trim();
    if (!body || sending) return;

    // Update the consecutive human-help counter for the escalation rule.
    counterRef.current = detectHumanHelpRequest(body)
      ? counterRef.current + 1
      : 0;
    setConsecutiveHumanRequests(counterRef.current);

    const userMessage: LugMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: body,
    };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft('');
    setSending(true);

    const result = await askLug(
      history.map((m) => ({ role: m.role, content: m.content })),
    );
    setSending(false);

    const reply =
      'reply' in result
        ? result.reply
        : "I'm having trouble reaching my brain right now. If you need help now, tap “Talk to a person” above.";

    setMessages((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, role: 'assistant', content: reply },
    ]);
  }, [draft, sending, messages]);

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Persistent human-escalation bar — always visible, above the fold. */}
      <Pressable
        onPress={onTalkToPerson}
        accessibilityRole="button"
        accessibilityLabel="Talk to a person"
        testID="lug-talk-to-person"
        style={[
          styles.escalateBar,
          escalationPrimary
            ? { backgroundColor: palette.deepIndigo }
            : {
                backgroundColor: isDark ? 'rgba(141,139,222,0.12)' : 'rgba(61,59,142,0.08)',
              },
        ]}
      >
        <Headphones
          size={16}
          color={escalationPrimary ? '#FFFFFF' : palette.deepIndigo}
          strokeWidth={2}
        />
        <Spacer size="sm" horizontal />
        <Text
          variant="label"
          style={{ color: escalationPrimary ? '#FFFFFF' : palette.deepIndigo }}
        >
          {escalationPrimary ? 'Talk to a person now' : 'Talk to a person'}
        </Text>
      </Pressable>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} palette={palette} isDark={isDark} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="sm" />}
        onContentSizeChange={scrollToEnd}
      />

      {sending ? (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color={palette.gearGold} />
          <Spacer size="sm" horizontal />
          <Text variant="caption" color="midGray">
            Lug is thinking…
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            backgroundColor: isDark ? '#16161F' : '#FFFFFF',
            borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask Lug…"
          placeholderTextColor={palette.midGray}
          multiline
          style={[
            styles.input,
            {
              color: palette.charcoal,
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : palette.offWhite,
            },
          ]}
          accessibilityLabel="Message to Lug"
          testID="lug-input"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send to Lug"
          testID="lug-send"
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? palette.electricBlue : palette.midGray },
          ]}
        >
          <Send size={18} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export default LugThread;

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  escalateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  listContent: {
    padding: spacing.base,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '88%',
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
  },
  bubbleRowTheirs: {
    alignSelf: 'flex-start',
  },
  lugAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.card,
    flexShrink: 1,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xs,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
