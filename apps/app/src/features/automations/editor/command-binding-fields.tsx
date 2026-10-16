import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationCommandInput, DeviceCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import {
  commandBindingKind,
  commandFields,
  commandFieldInput,
  type CommandField,
} from '../model/command-input';
import { BindingFields } from './binding-fields';
import { ArgumentInput } from './schema-arguments-input';
import { ValueInput } from './value-input';
import type { DeviceLike } from '../model/capability-choices';

interface CommandBindingFieldsProps {
  readonly binding: AutomationCommandInput;
  readonly catalog: Catalog;
  readonly onChange: (binding: AutomationCommandInput) => void;
  readonly capability: DeviceCapability | undefined;
  readonly device: DeviceLike | undefined;
}
interface BoundFieldProps extends CommandBindingFieldsProps {
  readonly name: string;
  readonly descriptor: CommandField | undefined;
}
function RemoveBoundField({ name, binding, onChange, descriptor }: BoundFieldProps): ReactNode {
  if (binding.type !== 'fields') return null;
  return (
    <Button
      label={`Remove ${name}`}
      variant="text"
      disabled={descriptor?.required === true}
      onPress={() => {
        onChange({
          ...binding,
          fields: Object.fromEntries(
            Object.entries(binding.fields).filter(([key]) => key !== name),
          ),
        });
      }}
    />
  );
}
function BoundField({ name, binding, catalog, onChange, descriptor }: BoundFieldProps): ReactNode {
  if (binding.type !== 'fields') return null;
  const input = binding.fields[name];
  if (input === undefined) return null;
  const update = (next: typeof input): void => {
    onChange({ ...binding, fields: { ...binding.fields, [name]: next } });
  };
  return (
    <View className="gap-3">
      <Text variant="body-strong">{name}</Text>
      <BindingFields
        input={input}
        catalog={catalog}
        onChange={update}
        {...(descriptor === undefined ? {} : { fixedKind: descriptor.kind })}
        {...(descriptor === undefined || input.binding.source !== 'literal'
          ? {}
          : {
              literal: (
                <ArgumentInput
                  name={name}
                  parameter={descriptor.parameter}
                  value={input.binding.value}
                  optional={!descriptor.required}
                  onChange={(value) => {
                    if (value !== undefined)
                      update({
                        ...input,
                        binding: { source: 'literal', kind: descriptor.kind, value },
                      });
                  }}
                />
              ),
            })}
      />
      <RemoveBoundField
        name={name}
        binding={binding}
        catalog={catalog}
        onChange={onChange}
        descriptor={descriptor}
        capability={undefined}
        device={undefined}
      />
    </View>
  );
}
function BoundFields(props: CommandBindingFieldsProps): ReactNode {
  const { binding, capability, onChange } = props;
  if (binding.type !== 'fields') return null;
  const fields = capability === undefined ? null : commandFields(capability);
  const available = (fields ?? []).filter((field) => binding.fields[field.name] === undefined);
  return (
    <>
      {Object.keys(binding.fields).map((name) => (
        <BoundField
          key={name}
          {...props}
          name={name}
          descriptor={fields?.find((field) => field.name === name)}
        />
      ))}
      {available.length === 0 ? null : (
        <Select
          label="Add an argument"
          value={null}
          options={available.map((field) => ({ value: field.name, label: field.name }))}
          onChange={(name) => {
            const field = available.find((entry) => entry.name === name);
            if (field !== undefined)
              onChange({
                ...binding,
                fields: { ...binding.fields, [name]: commandFieldInput(field) },
              });
          }}
        />
      )}
      {fields === null ? (
        <Text variant="footnote" tone="variant">
          The saved argument bindings are preserved. Select a supported control to choose its
          declared arguments.
        </Text>
      ) : null}
    </>
  );
}
export function CommandBindingFields(props: CommandBindingFieldsProps): ReactNode {
  const { binding, catalog, onChange, capability, device } = props;
  if (binding.type === 'fields') return <BoundFields {...props} />;
  const kind = capability === undefined ? null : commandBindingKind(capability);
  return (
    <BindingFields
      input={binding.input}
      catalog={catalog}
      {...(kind === null ? {} : { fixedKind: kind })}
      onChange={(input) => {
        onChange({ ...binding, input });
      }}
      {...(capability === undefined ||
      device === undefined ||
      binding.input.binding.source !== 'literal'
        ? {}
        : {
            literal: (
              <ValueInput
                label="Set to"
                capability={capability}
                device={device}
                value={binding.input.binding.value}
                onChange={(value) => {
                  onChange({
                    ...binding,
                    input: {
                      ...binding.input,
                      binding: {
                        source: 'literal',
                        kind: kind ?? binding.input.binding.kind,
                        value,
                      },
                    },
                  });
                }}
              />
            ),
          })}
    />
  );
}
