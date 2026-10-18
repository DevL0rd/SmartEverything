import type { ReactNode } from 'react';
import { View } from 'react-native';
import { humanizeEnum, type InputV2, type StepV2 } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { commandFields, fieldDefault, type CommandField } from '../model/command-input';
import { fieldInputs } from '../model/inputs';
import { capabilityLabel } from '../model/present';
import type { ControlChoice } from './control-choices';
import { InputField } from './input-field';

type SetStep = Extract<StepV2, { do: 'set' }>;

interface ArgumentsProps {
  readonly catalog: Catalog;
  readonly step: SetStep;
  readonly choice: ControlChoice;
  readonly onChange: (step: SetStep) => void;
}

function withFields(step: SetStep, fields: Readonly<Record<string, InputV2>>): SetStep {
  return { ...step, to: { ...fields } };
}

function ArgumentRow({
  catalog,
  field,
  input,
  onChange,
  onRemove,
}: {
  readonly catalog: Catalog;
  readonly field: CommandField;
  readonly input: InputV2;
  readonly onChange: (input: InputV2) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <InputField
        catalog={catalog}
        label={humanizeEnum(field.name)}
        shape={{ type: 'kind', kind: field.kind }}
        input={input}
        onChange={onChange}
        argument={field}
      />
      {field.required ? null : (
        <Button label={`Remove ${humanizeEnum(field.name)}`} variant="text" onPress={onRemove} />
      )}
    </View>
  );
}

function Hint({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="callout" tone="variant">
      {text}
    </Text>
  );
}

function ArgumentList({
  catalog,
  step,
  fields,
  onChange,
}: Omit<ArgumentsProps, 'choice'> & { readonly fields: readonly CommandField[] }): ReactNode {
  const given = fieldInputs(step.to);
  const missing = fields.filter((field) => given[field.name] === undefined);
  return (
    <View className="gap-3">
      {fields
        .filter((field) => given[field.name] !== undefined)
        .map((field) => (
          <ArgumentRow
            key={field.name}
            catalog={catalog}
            field={field}
            input={given[field.name] ?? ''}
            onChange={(input) => {
              onChange(withFields(step, { ...given, [field.name]: input }));
            }}
            onRemove={() => {
              onChange(
                withFields(
                  step,
                  Object.fromEntries(Object.entries(given).filter(([name]) => name !== field.name)),
                ),
              );
            }}
          />
        ))}
      {missing.length === 0 ? null : (
        <Select
          label="Add an argument"
          value={null}
          options={missing.map((field) => ({ value: field.name, label: humanizeEnum(field.name) }))}
          onChange={(name) => {
            const field = missing.find((entry) => entry.name === name);
            if (field !== undefined)
              onChange(withFields(step, { ...given, [name]: fieldDefault(field) }));
          }}
        />
      )}
    </View>
  );
}

export function ActionArguments({ catalog, step, choice, onChange }: ArgumentsProps): ReactNode {
  const fields = commandFields(choice.capability);
  const label = capabilityLabel(choice.device, choice.capability);
  const descriptor = choice.capability.value;
  if (fields === null)
    return descriptor.kind === 'action' && descriptor.arguments === undefined ? (
      <Hint text={`Runs “${label}”.`} />
    ) : (
      <Hint text="This action’s arguments are kept as saved." />
    );
  if (fields.length === 0) return <Hint text={`Runs “${label}”.`} />;
  return <ArgumentList catalog={catalog} step={step} fields={fields} onChange={onChange} />;
}
