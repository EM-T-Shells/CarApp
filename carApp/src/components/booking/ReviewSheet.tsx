// ReviewSheet — bottom-sheet rating flow opened from the booking detail
// screen after a job completes (Flow 2.11). Wraps the existing GearRating
// + KudosBadgeSelector primitives plus a 500-char review textarea and a
// single "Submit" CTA. On submit the parent receives the structured rating
// payload and is responsible for the insertRating + insertKudos writes.

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Spacer } from '../ui/Spacer';
import { Sheet } from '../ui/Sheet';
import { TextField } from '../ui/TextField';
import { GearRating } from '../ui/GearRating';
import type { GearRatingValues } from '../ui/GearRating';
import { KudosBadgeSelector } from '../kudos/KudosBadgeSelector';
import type { KudosType } from '../ui/KudosBadge';
import { spacing } from '../../design/tokens';

// ─── Constants ─────────────────────────────────────────────────────────

const REVIEW_MAX_LEN = 500;

// ─── Types ─────────────────────────────────────────────────────────────

export interface ReviewSubmission {
  ratings: GearRatingValues;
  kudos: KudosType[];
  reviewText: string;
}

export interface ReviewSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (submission: ReviewSubmission) => Promise<void> | void;
  /** Name shown in the sheet header — "Rate {providerName}". */
  providerName?: string;
  /** Disables the submit button while a parent-side mutation runs. */
  submitting?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────

export function ReviewSheet({
  visible,
  onClose,
  onSubmit,
  providerName,
  submitting = false,
}: ReviewSheetProps): React.ReactElement {
  const [values, setValues] = useState<Partial<GearRatingValues>>({});
  const [kudos, setKudos] = useState<KudosType[]>([]);
  const [reviewText, setReviewText] = useState('');

  const fullValues: GearRatingValues = useMemo(
    () => ({
      quality: values.quality ?? 0,
      timeliness: values.timeliness ?? 0,
      communication: values.communication ?? 0,
      value: values.value ?? 0,
    }),
    [values],
  );

  const allRated =
    fullValues.quality > 0 &&
    fullValues.timeliness > 0 &&
    fullValues.communication > 0 &&
    fullValues.value > 0;

  const handleChange = useCallback(
    (dimension: keyof GearRatingValues, rating: number) => {
      setValues((prev) => ({ ...prev, [dimension]: rating }));
    },
    [],
  );

  const reset = useCallback(() => {
    setValues({});
    setKudos([]);
    setReviewText('');
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Defer reset so the sheet's exit animation reads the prior state.
    setTimeout(reset, 350);
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    await onSubmit({
      ratings: fullValues,
      kudos,
      reviewText: reviewText.trim(),
    });
    reset();
  }, [onSubmit, fullValues, kudos, reviewText, reset]);

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={providerName ? `Rate ${providerName}` : 'Rate your service'}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="label" color="charcoal">
          Your gear rating
        </Text>
        <Spacer size="sm" />
        <Text variant="caption" color="midGray">
          Tap the gears to score each dimension.
        </Text>
        <Spacer size="md" />

        <GearRating
          values={values}
          interactive
          onChange={handleChange}
          size="md"
        />

        <Spacer size="xl" />

        <Text variant="label" color="charcoal">
          Send kudos
        </Text>
        <Spacer size="sm" />
        <Text variant="caption" color="midGray">
          Pick any that fit — they show up on the provider's profile.
        </Text>
        <Spacer size="md" />

        <KudosBadgeSelector selected={kudos} onChange={setKudos} />

        <Spacer size="xl" />

        <TextField
          label={`Review (optional, up to ${REVIEW_MAX_LEN} chars)`}
          placeholder="Tell future customers what went well."
          value={reviewText}
          onChangeText={(t) =>
            setReviewText(t.slice(0, REVIEW_MAX_LEN))
          }
          multiline
        />
        <Spacer size="xs" />
        <Text variant="caption" color="midGray" style={styles.charCount}>
          {reviewText.length}/{REVIEW_MAX_LEN}
        </Text>

        <Spacer size="lg" />

        <Button
          label="Submit Rating"
          variant="primary"
          size="lg"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!allRated || submitting}
        />
        <Spacer size="sm" />
        <Button
          label="Cancel"
          variant="ghost"
          size="md"
          onPress={handleClose}
          disabled={submitting}
        />

        <Spacer size="lg" />
      </ScrollView>
    </Sheet>
  );
}

export default ReviewSheet;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  charCount: {
    textAlign: 'right',
  },
});
