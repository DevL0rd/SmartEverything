import type { PlannerChallenge } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { CodeScanner } from '../../../components/code-scanner';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { ToastModal } from '../../../components/toast-modal';
import {
  DIFFICULTY_OPTIONS,
  mathsEdit,
  qrChallengeOf,
  sampleProblemOf,
  type MathsChallenge,
} from './challenge-draft';
import { useStepAccess } from './step-access';

const MOST = Number.MAX_SAFE_INTEGER;

export function MathsFields({
  challenge,
  disabled,
  onPick,
}: {
  readonly challenge: MathsChallenge;
  readonly disabled: boolean;
  readonly onPick: (challenge: PlannerChallenge) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <Segmented
        label="Difficulty"
        options={DIFFICULTY_OPTIONS}
        value={challenge.difficulty}
        disabled={disabled}
        fill
        onChange={(difficulty) => {
          onPick(mathsEdit(challenge, { difficulty }));
        }}
      />
      <View>
        <ListRow
          title="Problems"
          disabled={disabled}
          icon="calculator"
          compact
          trailing={
            <NumberStepper
              label="Problems"
              value={challenge.count}
              min={1}
              max={MOST}
              step={1}
              disabled={disabled}
              onChange={(count) => {
                onPick(mathsEdit(challenge, { count }));
              }}
            />
          }
        />
      </View>
      <SampleProblem challenge={challenge} />
    </View>
  );
}

function SampleProblem({ challenge }: { readonly challenge: MathsChallenge }): ReactNode {
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
      <Text variant="caption" tone="variant">
        Like
      </Text>
      <Text variant="title-3" className="tabular">
        {`${sampleProblemOf(challenge.difficulty)} = ?`}
      </Text>
    </View>
  );
}

export function QrFields({
  registered,
  disabled,
  onPick,
}: {
  readonly registered: boolean;
  readonly disabled: boolean;
  readonly onPick: (challenge: PlannerChallenge) => void;
}): ReactNode {
  const [scanning, setScanning] = useState(false);
  const close = (): void => {
    setScanning(false);
  };
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="qr" size={18} tone={registered ? 'positive' : 'variant'} />
        <Text variant="callout" className="flex-1">
          {registered ? 'A code is registered.' : 'Scan a code you keep away from the bed.'}
        </Text>
      </View>
      <View className="flex-row">
        <Button
          label={registered ? 'Scan a new code' : 'Scan the code'}
          icon="camera"
          variant="tonal"
          disabled={disabled}
          onPress={() => {
            setScanning(true);
          }}
        />
      </View>
      <QrScan
        open={scanning}
        onClose={close}
        onScanned={(next) => {
          close();
          onPick(next);
        }}
      />
    </View>
  );
}

function QrScan({
  open,
  onClose,
  onScanned,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onScanned: (challenge: PlannerChallenge) => void;
}): ReactNode {
  return (
    <ToastModal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <CodeScanner
        types={['qr']}
        shape="square"
        hint="Point at the code that will stop this alarm"
        purpose="The camera reads the code once, to register it for this alarm."
        read={(data) => {
          const next = qrChallengeOf(data);
          if (next === null) return 'This code is empty. Try another one.';
          onScanned(next);
          return null;
        }}
        onClose={onClose}
      />
    </ToastModal>
  );
}

const ACCESS_TEXT = {
  checking: null,
  elsewhere: 'The phone it rings on counts the steps.',
  unavailable: 'This phone has no step counter.',
  needed: 'Allow physical activity so the phone can count your steps.',
  allowed: 'This phone counts your steps.',
} as const;

export function StepsFields({
  steps,
  disabled,
  onPick,
}: {
  readonly steps: number;
  readonly disabled: boolean;
  readonly onPick: (challenge: PlannerChallenge) => void;
}): ReactNode {
  const step = useStepAccess(true);
  const text = ACCESS_TEXT[step.access];
  return (
    <View className="gap-3">
      <View>
        <ListRow
          title="Steps"
          disabled={disabled}
          icon="footprints"
          compact
          trailing={
            <NumberStepper
              label="Steps"
              value={steps}
              min={1}
              max={MOST}
              step={5}
              disabled={disabled}
              onChange={(next) => {
                onPick({ kind: 'steps', steps: next });
              }}
            />
          }
        />
      </View>
      {text === null ? null : (
        <Text variant="footnote" tone={step.access === 'unavailable' ? 'warning' : 'variant'}>
          {text}
        </Text>
      )}
      {step.access === 'needed' ? (
        <View className="flex-row">
          <Button label="Allow activity" icon="footprints" variant="tonal" onPress={step.ask} />
        </View>
      ) : null}
    </View>
  );
}
