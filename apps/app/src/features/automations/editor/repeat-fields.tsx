import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Action } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { NumberStepper } from '../../../components/number-stepper';
import type { Catalog } from '../data/use-automations';
import { ProgramConditions } from './program-conditions';
import { ProgramSteps } from './program-steps';
import { DurationField, type DurationUnits } from './time-fields';

type Repeat = Extract<Action, { type: 'repeat' }>;
const UNITS: DurationUnits = [
  { value: 'milliseconds', label: 'ms', size: 1 },
  { value: 'seconds', label: 's', size: 1000 },
  { value: 'minutes', label: 'min', size: 60_000 },
  { value: 'hours', label: 'h', size: 3_600_000 },
];

interface RepeatFieldsProps {
  readonly action: Repeat;
  readonly catalog: Catalog;
  readonly onChange: (action: Repeat) => void;
}

function RepeatTiming({ action, onChange }: RepeatFieldsProps): ReactNode {
  return (
    <>
      {' '}
      <DurationField
        label="Time limit"
        value={action.maximumDurationMs}
        units={UNITS}
        max={86_400_000}
        onChange={(maximumDurationMs) => {
          onChange({ ...action, maximumDurationMs: Math.max(100, maximumDurationMs) });
        }}
      />
      <DurationField
        label="Between repetitions"
        value={action.intervalMs}
        units={UNITS}
        max={86_400_000}
        onChange={(intervalMs) => {
          onChange({ ...action, intervalMs: Math.max(100, intervalMs) });
        }}
      />
    </>
  );
}

function RepeatMode({ action, onChange }: RepeatFieldsProps): ReactNode {
  return (
    <Select
      label="Repeat"
      value={action.repeat.mode}
      options={[
        { value: 'count', label: 'A number of times' },
        { value: 'while', label: 'While conditions match' },
        { value: 'until', label: 'Until conditions match' },
      ]}
      onChange={(mode) => {
        onChange({
          ...action,
          repeat:
            mode === 'count'
              ? { mode, count: 3 }
              : { mode, conditions: { mode: 'all', items: [] } },
        });
      }}
    />
  );
}

export function RepeatFields({ action, catalog, onChange }: RepeatFieldsProps): ReactNode {
  const { repeat } = action;
  return (
    <View className="gap-4">
      <RepeatMode action={action} catalog={catalog} onChange={onChange} />
      {repeat.mode === 'count' ? (
        <NumberStepper
          label="Times"
          min={1}
          max={10_000}
          step={1}
          value={repeat.count}
          onChange={(count) => {
            onChange({ ...action, repeat: { ...repeat, count } });
          }}
        />
      ) : (
        <ProgramConditions
          conditions={repeat.conditions}
          catalog={catalog}
          onChange={(conditions) => {
            onChange({ ...action, repeat: { ...repeat, conditions } });
          }}
        />
      )}
      <RepeatTiming action={action} catalog={catalog} onChange={onChange} />
      <Text variant="footnote" tone="variant">
        Every repeat has a time limit. Stop cancels future steps and waits.
      </Text>
      <ProgramSteps
        actions={action.actions}
        catalog={catalog}
        onChange={(actions) => {
          onChange({ ...action, actions: [...actions] });
        }}
      />
    </View>
  );
}
