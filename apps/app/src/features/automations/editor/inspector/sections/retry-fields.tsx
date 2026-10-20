import type { ReactNode } from 'react';
import { View } from 'react-native';
import { NumberStepper } from '../../../../../components/number-stepper';
import { SwitchRow } from '../../../../../components/rows';
import { Segmented } from '../../../../../components/segmented';
import type { RetrySetting } from './behaviour-model';
import { RETRY_MOST } from './behaviour-model';
import { DurationRow } from './duration-row';

export interface RetryFieldsProps {
  readonly retry: RetrySetting;
  readonly disabled: boolean;
  readonly onChange: (change: Partial<RetrySetting>) => void;
}

function RetryShape({ retry, disabled, onChange }: RetryFieldsProps): ReactNode {
  return (
    <View className="gap-2 px-4">
      <NumberStepper
        label="Attempts"
        value={retry.attempts}
        min={1}
        max={RETRY_MOST}
        step={1}
        disabled={disabled}
        onChange={(attempts) => {
          onChange({ attempts });
        }}
      />
      <Segmented
        label="Wait between attempts"
        options={[
          { value: 'fixed', label: 'Same wait' },
          { value: 'exponential', label: 'Longer each time' },
        ]}
        value={retry.backoff}
        disabled={disabled}
        onChange={(backoff) => {
          onChange({ backoff });
        }}
      />
    </View>
  );
}

function RetryWaits({ retry, disabled, onChange }: RetryFieldsProps): ReactNode {
  return (
    <>
      <DurationRow
        label="First wait"
        value={retry.initial}
        fallback={retry.initial}
        disabled={disabled}
        onChange={(initial) => {
          onChange({ initial });
        }}
      />
      <DurationRow
        label="Longest wait"
        value={retry.max}
        fallback={retry.initial}
        disabled={disabled}
        onChange={(max) => {
          onChange({ max });
        }}
      />
      <SwitchRow
        title="Spread the waits"
        subtitle="Adds a little randomness so retries do not bunch up."
        value={retry.jitter === true}
        disabled={disabled}
        onChange={(jitter) => {
          onChange({ jitter });
        }}
      />
    </>
  );
}

export function RetryFields(props: RetryFieldsProps): ReactNode {
  return (
    <View className="gap-2 py-2">
      <RetryShape {...props} />
      <RetryWaits {...props} />
    </View>
  );
}
