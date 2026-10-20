import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { BrushCandidate } from '../../../../modules/health-connect';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { WAKE_HELP, sortedCandidates } from '../model/setup-model';
import { CandidateRow } from './candidate-row';
import type { Progress } from './use-setup';

export function WakeStep({
  candidates,
  picked,
  onPick,
}: {
  readonly candidates: readonly BrushCandidate[];
  readonly picked: string | null;
  readonly onPick: (address: string) => void;
}): ReactNode {
  const found = sortedCandidates(candidates);
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {WAKE_HELP}
      </Text>
      {found.length === 0 ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" accessibilityLiveRegion="polite">
            Looking for toothbrushes…
          </Text>
        </View>
      ) : (
        <View className="gap-2" accessibilityRole="radiogroup">
          {found.map((candidate) => (
            <CandidateRow
              key={candidate.address}
              candidate={candidate}
              picked={picked === candidate.address}
              onPick={() => {
                onPick(candidate.address);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function Status({
  progress,
  failure,
  working,
}: {
  readonly progress: Progress;
  readonly failure: string;
  readonly working: string;
}): ReactNode {
  if (progress.kind === 'working') {
    return (
      <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
        <ActivityIndicator size="small" colorClassName="accent-primary" />
        <Text variant="callout" accessibilityLiveRegion="polite">
          {working}
        </Text>
      </View>
    );
  }
  return progress.kind === 'failed' ? (
    <Banner tone="critical" title={failure} body={progress.reason} wrapBody />
  ) : null;
}

export function ChooseStep({
  progress,
  done,
  onChoose,
}: {
  readonly progress: Progress;
  readonly done: boolean;
  readonly onChoose: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Android asks which brush SmartEverything may keep watching. Pick it in the list that opens.
        This also lets the phone notice the brush in the background.
      </Text>
      <Status
        progress={progress}
        failure="The brush was not chosen"
        working="Waiting for your choice…"
      />
      {done ? (
        <Banner tone="positive" title="Brush chosen" body="Continue to the next step." wrapBody />
      ) : (
        <Button
          label={progress.kind === 'failed' ? 'Try again' : 'Choose the brush'}
          size="lg"
          loading={progress.kind === 'working'}
          onPress={onChoose}
        />
      )}
    </View>
  );
}

export function VerifyStep({
  progress,
  done,
  onVerify,
}: {
  readonly progress: Progress;
  readonly done: boolean;
  readonly onVerify: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        SmartEverything connects once, reads what the brush offers and disconnects. Nothing is
        written to the brush.
      </Text>
      <Status progress={progress} failure="The brush did not answer" working="Reading the brush…" />
      {done ? (
        <Banner tone="positive" title="Read the brush" body="Continue to name it." wrapBody />
      ) : (
        <Button
          label={progress.kind === 'failed' ? 'Try again' : 'Read the brush'}
          size="lg"
          loading={progress.kind === 'working'}
          onPress={onVerify}
        />
      )}
    </View>
  );
}
