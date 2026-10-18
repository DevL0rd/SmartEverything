import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StepV2, TargetV2 } from '@smarteverything/domain';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { defaultValue } from '../model/capability-choices';
import { singleInput } from '../model/inputs';
import { ActionArguments } from './action-arguments';
import { controlChoices, type ControlChoice } from './control-choices';
import { InputField } from './input-field';
import { NumberInput } from './number-input';
import { TargetPicker } from './target-picker';
import { TemporaryFields } from './temporary-fields';
import { withTemporary } from './temporary-step';

type SetStep = Extract<StepV2, { do: 'set' }>;

interface ControlFieldsProps {
  readonly catalog: Catalog;
  readonly step: SetStep;
  readonly onChange: (step: SetStep) => void;
}

function withControl(step: SetStep, choice: ControlChoice): SetStep {
  const { by: _by, percent: _percent, to: _to, ...rest } = step;
  const kept: Omit<SetStep, 'by' | 'percent' | 'to'> = choice.percent
    ? withoutTemporary(rest)
    : rest;
  return {
    ...kept,
    control: choice.reference,
    to: defaultValue(choice.capability.value),
    ...(choice.percent ? { percent: true } : {}),
  };
}

function withoutTemporary(
  step: Omit<SetStep, 'by' | 'percent' | 'to'>,
): Omit<SetStep, 'by' | 'percent' | 'to'> {
  const { for: _for, while: _while, priority: _priority, ...rest } = step;
  return rest;
}

function withTarget(catalog: Catalog, step: SetStep, target: TargetV2): SetStep {
  const choices = controlChoices(catalog, target);
  const next = choices.find((entry) => entry.reference === step.control) ?? choices[0];
  const moved: SetStep = { ...step, target };
  return next === undefined || next.reference === step.control ? moved : withControl(moved, next);
}

function ChangeMode({
  step,
  choice,
  onChange,
}: ControlFieldsProps & { readonly choice: ControlChoice }): ReactNode {
  if (step.for === undefined || choice.capability.value.kind !== 'number') return null;
  const { to: _to, by: _by, ...rest } = step;
  return (
    <Segmented
      label="Temporary change"
      value={step.by === undefined ? 'set' : 'add'}
      options={[
        { value: 'set', label: 'Set to' },
        { value: 'add', label: 'Change by' },
      ]}
      onChange={(mode) => {
        onChange(
          mode === 'set'
            ? { ...rest, to: defaultValue(choice.capability.value) }
            : { ...rest, by: 1 },
        );
      }}
    />
  );
}

function ValueFields({
  catalog,
  step,
  choice,
  onChange,
}: ControlFieldsProps & { readonly choice: ControlChoice }): ReactNode {
  const descriptor = choice.capability.value;
  if (descriptor.kind === 'action')
    return <ActionArguments catalog={catalog} step={step} choice={choice} onChange={onChange} />;
  if (step.by !== undefined)
    return (
      <NumberInput
        label="Change by"
        value={step.by}
        onChange={(by) => {
          if (by !== undefined) onChange({ ...step, by });
        }}
      />
    );
  return (
    <InputField
      catalog={catalog}
      label="Set to"
      shape={{ type: 'reading', device: choice.device, capability: choice.capability }}
      input={singleInput(step.to, defaultValue(descriptor))}
      onChange={(to) => {
        onChange({ ...step, to });
      }}
    />
  );
}

export function ControlFields(props: ControlFieldsProps): ReactNode {
  const { catalog, step, onChange } = props;
  const choices = controlChoices(catalog, step.target);
  const choice = choices.find((entry) => entry.reference === step.control);
  return (
    <View className="gap-3">
      <TargetPicker
        catalog={catalog}
        target={step.target}
        onChange={(target) => {
          onChange(withTarget(catalog, step, target));
        }}
      />
      {choices.length === 0 ? (
        <Text variant="callout" tone="critical">
          Nothing here can be controlled. Pick another target.
        </Text>
      ) : (
        <Select
          label="Setting"
          searchable
          value={choice === undefined ? null : choice.reference}
          placeholder="Pick a setting"
          options={choices.map((entry) => ({ value: entry.reference, label: entry.label }))}
          onChange={(reference) => {
            const next = choices.find((entry) => entry.reference === reference);
            if (next !== undefined) onChange(withControl(step, next));
          }}
        />
      )}
      {choice === undefined ? null : (
        <>
          <ChangeMode {...props} choice={choice} />
          <ValueFields {...props} choice={choice} />
          <TemporaryFields
            catalog={catalog}
            step={step}
            blocked={
              choice.percent ? 'Pick a single device to change this setting for a while.' : null
            }
            onChange={(change) => {
              onChange(withTemporary(step, change, defaultValue(choice.capability.value)));
            }}
          />
        </>
      )}
    </View>
  );
}
