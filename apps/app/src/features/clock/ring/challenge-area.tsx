import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../../../components/button';
import { Arc } from '../../../components/charts/arc';
import { CodeScanner } from '../../../components/code-scanner';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { ToastModal } from '../../../components/toast-modal';
import { qrRefusalOf, stepsProgressOf, type ChallengePlan } from './challenge-model';
import { MathsPad } from './maths-pad';
import { useStepCount } from './ring-device';

const STEPS_RING = 168;
const STEPS_STROKE = 14;

interface AreaProps {
  readonly plan: Exclude<ChallengePlan, { readonly kind: 'none' }>;
  readonly seed: string;
  readonly enabled: boolean;
  readonly onSolved: () => void;
  readonly stop: ReactNode;
}

function Panel({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-3 rounded-xl bg-surface-1/80 p-card-pad">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} tone="primary" />
        <Text variant="body-strong">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function QrScanner({
  open,
  code,
  onClose,
  onSolved,
}: {
  readonly open: boolean;
  readonly code: string;
  readonly onClose: () => void;
  readonly onSolved: () => void;
}): ReactNode {
  return (
    <ToastModal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <CodeScanner
        types={['qr']}
        shape="square"
        hint="Point at the code for this alarm"
        purpose="The camera reads the code that stops this alarm."
        read={(data) => {
          const refused = qrRefusalOf(data, code);
          if (refused === null) {
            onClose();
            onSolved();
          }
          return refused;
        }}
        onClose={onClose}
      />
    </ToastModal>
  );
}

function QrChallenge({
  code,
  enabled,
  onSolved,
}: {
  readonly code: string;
  readonly enabled: boolean;
  readonly onSolved: () => void;
}): ReactNode {
  const [scanning, setScanning] = useState(false);
  const close = (): void => {
    setScanning(false);
  };
  return (
    <Panel icon="qr" title="Scan your code to stop it">
      <Text variant="callout" tone="variant">
        Go to the code you scanned when you set up this alarm and point the camera at it.
      </Text>
      <Button
        size="lg"
        icon="camera"
        label="Scan the code"
        disabled={!enabled}
        onPress={() => {
          setScanning(true);
        }}
      />
      <QrScanner open={scanning} code={code} onClose={close} onSolved={onSolved} />
    </Panel>
  );
}

function StepsRing({
  count,
  target,
}: {
  readonly count: number;
  readonly target: number;
}): ReactNode {
  return (
    <View className="items-center justify-center self-center">
      <Arc
        value={stepsProgressOf(count, target)}
        size={STEPS_RING}
        thickness={STEPS_STROKE}
        colour="primary"
      />
      <View className="absolute items-center">
        <Text className="font-mono-medium text-figure-l tabular">{String(count)}</Text>
        <Text variant="caption" tone="variant">{`of ${String(target)} steps`}</Text>
      </View>
    </View>
  );
}

function StepsChallenge({
  steps,
  enabled,
  onSolved,
  stop,
}: Omit<AreaProps, 'plan' | 'seed'> & { readonly steps: number }): ReactNode {
  const counter = useStepCount(true);
  const solved = useRef(false);
  const reached = counter.state === 'counting' && counter.count >= steps;
  useEffect(() => {
    if (!reached || solved.current) return;
    solved.current = true;
    onSolved();
  }, [reached, onSolved]);
  if (counter.state === 'unavailable' || counter.state === 'refused') {
    return (
      <View className="gap-3">
        <Text variant="callout" tone="warning" align="center" role="alert">
          {counter.state === 'unavailable'
            ? 'This phone can’t count steps, so slide to stop it instead.'
            : 'Steps can’t be counted without the physical activity permission, so slide to stop it instead.'}
        </Text>
        {stop}
      </View>
    );
  }
  return (
    <Panel icon="footprints" title={`Walk ${String(steps)} steps to stop it`}>
      {counter.state === 'checking' ? (
        <ActivityIndicator accessibilityLabel="Starting the step counter" className="py-6" />
      ) : null}
      {counter.state === 'needs_permission' ? (
        <Button
          icon="footprints"
          label="Allow step counting"
          disabled={!enabled}
          onPress={counter.allow}
        />
      ) : null}
      {counter.state === 'counting' ? <StepsRing count={counter.count} target={steps} /> : null}
    </Panel>
  );
}

function PhoneOnly({ what }: { readonly what: 'qr' | 'steps' }): ReactNode {
  return (
    <Panel icon="smartphone" title="Stop it on your phone">
      <Text variant="callout" tone="variant">
        {what === 'qr'
          ? 'This alarm stops when you scan its code, which needs your phone’s camera.'
          : 'This alarm stops when you walk with your phone, which counts the steps.'}
      </Text>
    </Panel>
  );
}

export function ChallengeArea({ plan, seed, enabled, onSolved, stop }: AreaProps): ReactNode {
  if (plan.kind === 'maths') {
    return <MathsPad plan={plan} seed={seed} enabled={enabled} onSolved={onSolved} />;
  }
  if (plan.kind === 'qr')
    return <QrChallenge code={plan.code} enabled={enabled} onSolved={onSolved} />;
  if (plan.kind === 'steps') {
    return <StepsChallenge steps={plan.steps} enabled={enabled} onSolved={onSolved} stop={stop} />;
  }
  return <PhoneOnly what={plan.what} />;
}
