import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { Card } from '../../../../components/card';
import { Icon, type IconName } from '../../../../components/icon';
import { IconWell } from '../../../../components/icon-well';
import { ProgressSteps, stepsAt } from '../../../../components/progress-steps';
import { Switch } from '../../../../components/switch';
import { Text } from '../../../../components/text';
import { useMutationState, type MutationState } from '../../../../store/mutation';
import { useSession } from '../../../../store/selectors';
import { photoKeys } from '../../data/keys';
import { setLockedPin, unlockLockedFolder } from '../api';
import { fingerprintAvailable, forgetPin, keepPin, keptPin, pinKept } from './biometric';
import {
  advanceSetup,
  pinReady,
  SETUP_START,
  setupStepNumber,
  type SetupStep,
} from './locked-model';
import { PinField } from './pin-field';
import { openLockedSession } from './session';

const PROMISES: readonly { readonly icon: IconName; readonly text: string }[] = [
  { icon: 'eyeOff', text: 'Hidden from the Library, search, albums, sharing and Drive' },
  { icon: 'shield', text: 'Never sent to the AI, never analysed, never backed up elsewhere' },
  { icon: 'key', text: 'Opens only with your PIN, and locks again when you leave' },
];

function Promises(): ReactNode {
  return (
    <View className="gap-2">
      {PROMISES.map((line) => (
        <View key={line.icon} className="flex-row items-center gap-3">
          <Icon name={line.icon} size={20} tone="variant" />
          <Text variant="callout" className="min-w-0 flex-1">
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GateCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="w-full max-w-160 self-center pt-4">
      <Card>
        <View className="gap-5">
          <View className="flex-row items-center gap-3">
            <IconWell icon="lock" colour="primary" size="l" />
            <Text variant="title-2" className="min-w-0 flex-1">
              {title}
            </Text>
          </View>
          {children}
        </View>
      </Card>
    </View>
  );
}

function unlockWith(mutation: MutationState, pin: string, onOpened?: () => void): void {
  mutation.run(() => unlockLockedFolder(pin), {
    failure: 'The Locked folder did not open',
    label: 'photos.locked.unlock',
    inline: true,
    onDone: (unlocked) => {
      openLockedSession(unlocked);
      onOpened?.();
    },
  });
}

const SETUP_LABELS = ['Choose a PIN', 'Enter it again', 'Fingerprint'];

function setupCopy(step: SetupStep): { readonly label: string; readonly helper: string } {
  if (step.kind === 'choose') {
    return { label: 'Choose a PIN', helper: 'Use at least four digits you will remember.' };
  }
  return { label: 'Enter the PIN again', helper: 'Type the same PIN to confirm it.' };
}

function FingerprintStep({
  on,
  onChange,
}: {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-3">
      <Icon name="key" size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="callout">Unlock with fingerprint</Text>
        <Text variant="footnote" tone="variant">
          This phone keeps the PIN behind your fingerprint or face unlock.
        </Text>
      </View>
      <Switch value={on} onChange={onChange} label="Unlock with fingerprint" />
    </View>
  );
}

function useSaveSetup(
  clientId: string,
  fingerprint: boolean,
): { readonly mutation: MutationState; readonly save: (pin: string) => void } {
  const client = useQueryClient();
  const mutation = useMutationState();
  const save = (pin: string): void => {
    mutation.run(
      async () => {
        await setLockedPin({ pin, currentPin: null });
        if (fingerprint) await keepPin(clientId, pin);
        return unlockLockedFolder(pin);
      },
      {
        failure: 'The Locked folder was not set up',
        label: 'photos.locked.setup',
        inline: true,
        onDone: (unlocked) => {
          openLockedSession(unlocked);
          background(
            client.invalidateQueries({ queryKey: photoKeys.lockedState() }),
            'photos.locked.state_failed',
          );
        },
      },
    );
  };
  return { mutation, save };
}

function useSetup(clientId: string): {
  readonly step: SetupStep;
  readonly error: string | null;
  readonly fingerprint: boolean;
  readonly setFingerprint: (on: boolean) => void;
  readonly setPin: (pin: string) => void;
  readonly next: () => void;
  readonly mutation: MutationState;
} {
  const offer = fingerprintAvailable();
  const [step, setStep] = useState<SetupStep>(SETUP_START);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState(offer);
  const { mutation, save } = useSaveSetup(clientId, offer && fingerprint);
  return {
    step,
    error: error ?? mutation.problem,
    fingerprint,
    setFingerprint,
    setPin: (pin): void => {
      setError(null);
      setStep(step.kind === 'repeat' ? { ...step, again: pin } : { kind: 'choose', pin });
    },
    next: (): void => {
      const advanced = advanceSetup(step, offer);
      setStep(advanced.step);
      setError(advanced.error);
      if (advanced.save !== null) save(advanced.save);
    },
    mutation,
  };
}

export function LockedSetup(): ReactNode {
  const setup = useSetup(useSession().client.id);
  const { step } = setup;
  const copy = setupCopy(step);
  const value = step.kind === 'repeat' ? step.again : step.kind === 'choose' ? step.pin : '';
  const labels = fingerprintAvailable() ? SETUP_LABELS : SETUP_LABELS.slice(0, 2);
  return (
    <GateCard title="Set up your Locked folder">
      <Promises />
      <ProgressSteps steps={stepsAt(labels, setupStepNumber(step) - 1)} />
      {step.kind === 'fingerprint' ? (
        <FingerprintStep on={setup.fingerprint} onChange={setup.setFingerprint} />
      ) : (
        <PinField
          key={step.kind}
          label={copy.label}
          helper={copy.helper}
          value={value}
          onChange={setup.setPin}
          onSubmit={setup.next}
          error={setup.error}
        />
      )}
      <View className="flex-row justify-end">
        <Button
          label={step.kind === 'choose' ? 'Continue' : 'Set up Locked folder'}
          icon={step.kind === 'choose' ? 'chevronRight' : 'lock'}
          loading={setup.mutation.busy}
          disabled={step.kind !== 'fingerprint' && !pinReady(value)}
          onPress={setup.next}
        />
      </View>
    </GateCard>
  );
}

function useFingerprint(
  clientId: string,
  mutation: MutationState,
): {
  readonly kept: boolean;
  readonly use: () => void;
} {
  const [kept, setKept] = useState(false);
  useEffect(() => {
    let current = true;
    background(
      pinKept(clientId).then((value) => {
        if (current) setKept(value);
      }),
      'photos.locked.fingerprint_check_failed',
    );
    return (): void => {
      current = false;
    };
  }, [clientId]);
  return {
    kept,
    use: (): void => {
      background(
        keptPin(clientId).then(async (pin) => {
          if (pin !== null) {
            unlockWith(mutation, pin);
            return;
          }
          await forgetPin(clientId);
          setKept(false);
        }),
        'photos.locked.fingerprint_failed',
      );
    },
  };
}

export function LockedUnlock({ onChangePin }: { readonly onChangePin: () => void }): ReactNode {
  const clientId = useSession().client.id;
  const mutation = useMutationState();
  const [pin, setPin] = useState('');
  const fingerprint = useFingerprint(clientId, mutation);
  const unlock = (): void => {
    if (pinReady(pin))
      unlockWith(mutation, pin, () => {
        setPin('');
      });
  };
  return (
    <GateCard title="Enter your PIN">
      <Promises />
      <PinField
        label="Locked folder PIN"
        helper="The folder locks again when you leave this page."
        value={pin}
        onChange={setPin}
        onSubmit={unlock}
        error={mutation.problem}
      />
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button label="Change PIN" variant="text" disabled={mutation.busy} onPress={onChangePin} />
        {fingerprint.kept ? (
          <Button
            label="Use fingerprint"
            icon="key"
            variant="tonal"
            disabled={mutation.busy}
            onPress={fingerprint.use}
          />
        ) : null}
        <Button
          label="Unlock"
          icon="lockOpen"
          loading={mutation.busy}
          disabled={!pinReady(pin)}
          onPress={unlock}
        />
      </View>
    </GateCard>
  );
}
