import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StepV2 } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { describeStep } from '../model/describe-steps';
import { OnlyIfFields } from './condition-list';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import { MILLISECOND_UNITS } from './duration-units';
import { Labelled } from './labelled';
import { DurationField } from './time-fields';

type RepeatStep = Extract<StepV2, { do: 'repeat' }>;
type Mode = 'times' | 'while' | 'until';

const MOST_TIMES = 10_000;
const LEAST_GAP_MS = 100;
const DEFAULT_GAP_MS = 1000;
const DEFAULT_LIMIT_MS = HOUR_MS;

interface RepeatFieldsProps {
  readonly catalog: Catalog;
  readonly step: RepeatStep;
  readonly onChange: (step: RepeatStep) => void;
}

function modeOf(step: RepeatStep): Mode {
  if (step.times !== undefined) return 'times';
  return step.while === undefined ? 'until' : 'while';
}

function withMode(step: RepeatStep, mode: Mode): RepeatStep {
  const { times: _times, while: _while, until: _until, ...rest } = step;
  if (mode === 'times') return { ...rest, times: 3 };
  return mode === 'while' ? { ...rest, while: { all: [] } } : { ...rest, until: { all: [] } };
}

function Condition({ catalog, step, onChange }: RepeatFieldsProps): ReactNode {
  const mode = modeOf(step);
  if (mode === 'times') return null;
  const current = mode === 'while' ? step.while : step.until;
  return (
    <OnlyIfFields
      catalog={catalog}
      condition={current}
      onChange={(condition) => {
        const next = condition ?? { all: [] };
        onChange(mode === 'while' ? { ...step, while: next } : { ...step, until: next });
      }}
    />
  );
}

function Timing({ step, onChange }: RepeatFieldsProps): ReactNode {
  return (
    <>
      <DurationField
        label="Wait between repeats"
        value={step.gapMs ?? DEFAULT_GAP_MS}
        units={MILLISECOND_UNITS}
        max={DAY_MS}
        onChange={(gapMs) => {
          onChange({ ...step, gapMs: Math.max(LEAST_GAP_MS, gapMs) });
        }}
      />
      <DurationField
        label="Stop after"
        value={step.limitMs ?? DEFAULT_LIMIT_MS}
        units={MILLISECOND_UNITS}
        max={DAY_MS}
        onChange={(limitMs) => {
          onChange({ ...step, limitMs });
        }}
      />
    </>
  );
}

function Times({ step, onChange }: RepeatFieldsProps): ReactNode {
  if (step.times === undefined) return null;
  return (
    <Labelled label="How many times">
      <NumberStepper
        label="How many times"
        min={1}
        max={MOST_TIMES}
        step={1}
        value={step.times}
        onChange={(times) => {
          onChange({ ...step, times });
        }}
      />
    </Labelled>
  );
}

export function RepeatFields(props: RepeatFieldsProps): ReactNode {
  const { catalog, step, onChange } = props;
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {describeStep(catalog.names, step)}
      </Text>
      <Select
        label="Repeat"
        value={modeOf(step)}
        options={[
          { value: 'times', label: 'A number of times' },
          { value: 'while', label: 'While something is true' },
          { value: 'until', label: 'Until something is true' },
        ]}
        onChange={(next) => {
          onChange(withMode(step, next));
        }}
      />
      <Times {...props} />
      <Condition {...props} />
      <Timing {...props} />
      <Text variant="footnote" tone="variant">
        A repeat always ends at its time limit. Stop ends it earlier.
      </Text>
    </View>
  );
}
