import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { ProgressSteps, stepsAt } from '../../../../components/progress-steps';
import { notify } from '../../../../components/toast-store';
import { useMutationState } from '../../../../store/mutation';
import { useSession } from '../../../../store/selectors';
import { setLockedPin } from '../api';
import { keepPin, pinKept } from './biometric';
import { GateCard } from './locked-gate';
import {
  advanceChange,
  CHANGE_START,
  changeStepNumber,
  changeValue,
  pinReady,
  withChangeValue,
  type ChangeStep,
} from './locked-model';
import { PinField } from './pin-field';

const CHANGE_LABELS = ['Current PIN', 'New PIN', 'Confirm'];

function changeCopy(step: ChangeStep): { readonly label: string; readonly helper: string } {
  if (step.kind === 'current') {
    return { label: 'PIN', helper: 'Enter the PIN that opens the folder now.' };
  }
  if (step.kind === 'choose') {
    return { label: 'PIN', helper: 'Use at least four digits you will remember.' };
  }
  return { label: 'New PIN again', helper: 'Type the same PIN to confirm it.' };
}

async function saveChange(clientId: string, currentPin: string, pin: string): Promise<void> {
  await setLockedPin({ pin, currentPin });
  if (await pinKept(clientId)) await keepPin(clientId, pin);
}

function useChange(onDone: () => void): {
  readonly step: ChangeStep;
  readonly error: string | null;
  readonly busy: boolean;
  readonly setPin: (pin: string) => void;
  readonly next: () => void;
} {
  const clientId = useSession().client.id;
  const mutation = useMutationState();
  const [step, setStep] = useState<ChangeStep>(CHANGE_START);
  const [error, setError] = useState<string | null>(null);
  const save = (currentPin: string, pin: string): void => {
    mutation.run(
      async () => {
        try {
          await saveChange(clientId, currentPin, pin);
        } catch (failure: unknown) {
          setStep(CHANGE_START);
          throw failure;
        }
      },
      {
        failure: 'The PIN was not changed',
        label: 'photos.locked.change_pin',
        inline: true,
        onDone: () => {
          notify({ message: 'Locked folder PIN changed' });
          onDone();
        },
      },
    );
  };
  return {
    step,
    error: error ?? mutation.problem,
    busy: mutation.busy,
    setPin: (pin): void => {
      setError(null);
      setStep(withChangeValue(step, pin));
    },
    next: (): void => {
      const advanced = advanceChange(step);
      setStep(advanced.step);
      setError(advanced.error);
      if (advanced.save !== null) save(advanced.save.currentPin, advanced.save.pin);
    },
  };
}

export function LockedChangePin({ onDone }: { readonly onDone: () => void }): ReactNode {
  const change = useChange(onDone);
  const { step } = change;
  const copy = changeCopy(step);
  const value = changeValue(step);
  return (
    <GateCard title="Change your PIN">
      <ProgressSteps steps={stepsAt(CHANGE_LABELS, changeStepNumber(step) - 1)} />
      <PinField
        key={step.kind}
        label={copy.label}
        helper={copy.helper}
        value={value}
        onChange={change.setPin}
        onSubmit={change.next}
        error={change.error}
      />
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button label="Cancel" variant="text" disabled={change.busy} onPress={onDone} />
        <Button
          label={step.kind === 'repeat' ? 'Change PIN' : 'Continue'}
          {...(step.kind === 'repeat' ? { icon: 'key' as const } : {})}
          loading={change.busy}
          disabled={!pinReady(value)}
          onPress={change.next}
        />
      </View>
    </GateCard>
  );
}
