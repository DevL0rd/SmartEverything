import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  MAX_AUTOMATION_QUEUE,
  MAX_AUTOMATION_PARALLEL,
  type AutomationRunPolicy,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { NumberStepper } from '../../../components/number-stepper';

export interface RunPolicyFieldsProps {
  readonly focusControlKey?: boolean;
  readonly policy: AutomationRunPolicy | undefined;
  readonly controlKey: string | undefined;
  readonly onChange: (
    policy: AutomationRunPolicy | undefined,
    controlKey: string | undefined,
  ) => void;
}

const DETAILS = {
  single: 'Ignore another start while this program is active.',
  restart: 'Stop the previous run before starting again.',
  queue: 'Wait for the active run, then run queued starts in order.',
  parallel: 'Allow independent runs at the same time.',
};

const POLICIES = [
  { value: 'legacy', label: 'Legacy parallel' },
  { value: 'single', label: 'Single' },
  { value: 'restart', label: 'Restart' },
  { value: 'queue', label: 'Queue' },
  { value: 'parallel', label: 'Parallel' },
] as const;

function ControlKeyField({
  policy,
  controlKey,
  onChange,
  focusControlKey,
}: RunPolicyFieldsProps): ReactNode {
  return (
    <TextField
      label="Control key (optional)"
      focusOnMount={focusControlKey === true}
      helper="Use a shared key to stop matching runs from another automation."
      value={controlKey ?? ''}
      onChange={(key) => {
        onChange(policy, key.trim() === '' ? undefined : key);
      }}
    />
  );
}

export function RunPolicyFields({
  policy,
  controlKey,
  onChange,
  focusControlKey,
}: RunPolicyFieldsProps): ReactNode {
  const current = policy;
  return (
    <View className="gap-3">
      <Select
        label="When it starts again"
        value={current?.mode ?? 'legacy'}
        options={POLICIES}
        onChange={(mode) => {
          onChange(
            mode === 'legacy'
              ? undefined
              : mode === 'queue' || mode === 'parallel'
                ? { mode, limit: 2 }
                : { mode },
            controlKey,
          );
        }}
      />
      <Text variant="callout" tone="variant">
        {current === undefined
          ? 'This saved program retains its legacy parallel behavior. Choose a policy to set explicit limits.'
          : DETAILS[current.mode]}
      </Text>
      {current !== undefined && (current.mode === 'queue' || current.mode === 'parallel') ? (
        <NumberStepper
          label={current.mode === 'queue' ? 'Queue capacity' : 'Concurrent runs'}
          value={current.limit}
          min={1}
          max={current.mode === 'queue' ? MAX_AUTOMATION_QUEUE : MAX_AUTOMATION_PARALLEL}
          step={1}
          onChange={(limit) => {
            onChange({ ...current, limit }, controlKey);
          }}
        />
      ) : null}
      <ControlKeyField
        policy={current}
        controlKey={controlKey}
        onChange={onChange}
        focusControlKey={focusControlKey === true}
      />
    </View>
  );
}
