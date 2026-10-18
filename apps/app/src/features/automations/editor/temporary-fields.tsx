import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ConditionV2 } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { OnlyIfFields } from './condition-list';
import { DAY_MS } from '../../../format/time';
import { MILLISECOND_UNITS } from './duration-units';
import { Labelled } from './labelled';
import { DurationField } from './time-fields';

const TEN_MINUTES_MS = 600_000;
const PRIORITY_LIMIT = 1000;

export interface Temporary {
  readonly for?: number | undefined;
  readonly while?: ConditionV2 | undefined;
  readonly priority?: number | undefined;
}

interface TemporaryFieldsProps {
  readonly catalog: Catalog;
  readonly step: Temporary;
  readonly blocked: string | null;
  readonly onChange: (change: Temporary) => void;
}

function OnlyWhile({ catalog, step, onChange }: Omit<TemporaryFieldsProps, 'blocked'>): ReactNode {
  return (
    <>
      <SwitchRow
        title="Only while something is true"
        subtitle="Ends early when the condition stops holding."
        value={step.while !== undefined}
        onChange={(enabled) => {
          const { while: _while, ...rest } = step;
          onChange(enabled ? { ...rest, while: { all: [] } } : rest);
        }}
      />
      {step.while === undefined ? null : (
        <OnlyIfFields
          catalog={catalog}
          condition={step.while}
          onChange={(condition) => {
            onChange({ ...step, while: condition ?? { all: [] } });
          }}
        />
      )}
    </>
  );
}

function PriorityField({
  step,
  onChange,
}: Omit<TemporaryFieldsProps, 'blocked' | 'catalog'>): ReactNode {
  return (
    <>
      <Labelled label="Priority">
        <NumberStepper
          label="Priority"
          value={step.priority ?? 0}
          min={-PRIORITY_LIMIT}
          max={PRIORITY_LIMIT}
          step={1}
          onChange={(priority) => {
            const { priority: _priority, ...rest } = step;
            onChange(priority === 0 ? rest : { ...rest, priority });
          }}
        />
      </Labelled>
      <Text variant="footnote" tone="variant">
        When several temporary changes overlap, the higher priority wins.
      </Text>
    </>
  );
}

export function TemporaryFields(props: TemporaryFieldsProps): ReactNode {
  const { step, blocked, onChange } = props;
  return (
    <View className="gap-3">
      <SwitchRow
        title="For a while"
        subtitle={blocked ?? 'Go back to how it was when the time is up.'}
        disabled={blocked !== null}
        value={step.for !== undefined}
        onChange={(enabled) => {
          onChange(enabled ? { for: TEN_MINUTES_MS } : {});
        }}
      />
      {step.for === undefined ? null : (
        <>
          <DurationField
            label="For how long"
            value={step.for}
            units={MILLISECOND_UNITS}
            max={DAY_MS}
            onChange={(length) => {
              onChange({ ...step, for: length });
            }}
          />
          <OnlyWhile {...props} />
          <PriorityField step={step} onChange={onChange} />
        </>
      )}
    </View>
  );
}
