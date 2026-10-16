import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  AUTOMATION_BINDING_KIND,
  type AutomationInput,
  type AutomationBinding,
  type AutomationBindingKind,
  type JsonValue,
} from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { BindingLibraryButtons } from './library-buttons';
import { InputOffsetFields } from './input-offset-fields';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import {
  bindingSourceChoices,
  bindingProblem,
  inputCapabilities,
  literalInput,
} from '../model/input-bindings';
export { literalValue, literalInput } from '../model/input-bindings';
import { TargetFields } from './target-fields';
import { NumberInput } from './number-input';

interface TypedLiteralProps {
  readonly kind: AutomationBindingKind;
  readonly value: JsonValue;
  readonly catalog: Catalog;
  readonly onChange: (value: JsonValue) => void;
}

export function TypedLiteral({ kind, value, catalog, onChange }: TypedLiteralProps): ReactNode {
  if (kind === 'boolean')
    return <SwitchRow title="Value" value={value === true} onChange={onChange} />;
  if (kind === 'number' || kind === 'duration')
    return (
      <NumberInput
        label={kind === 'duration' ? 'Milliseconds' : 'Number'}
        value={typeof value === 'number' ? value : undefined}
        onChange={(next) => {
          if (next !== undefined) onChange(next);
        }}
      />
    );
  if (kind === 'choice')
    return (
      <Select
        label="Choice"
        searchable
        value={typeof value === 'string' ? value : null}
        options={(catalog.values ?? []).flatMap((row) =>
          row.content.kind === 'choice'
            ? row.content.choices.map((choice) => ({
                value: choice.id,
                label: `${row.content.name} · ${choice.label}`,
              }))
            : [],
        )}
        onChange={onChange}
      />
    );
  return (
    <TextField label="Text" value={typeof value === 'string' ? value : ''} onChange={onChange} />
  );
}

interface BindingSourceProps {
  readonly binding: AutomationBinding;
  readonly catalog: Catalog;
  readonly onChange: (binding: AutomationBinding) => void;
}

interface ParameterBindingProps extends BindingSourceProps {
  readonly binding: Extract<AutomationBinding, { source: 'parameter' }>;
}
function ParameterBinding({ binding, catalog, onChange }: ParameterBindingProps): ReactNode {
  return (
    <Select
      label="Parameter"
      value={binding.name}
      options={(catalog.parameters ?? [])
        .filter((parameter) => parameter.kind === binding.kind)
        .map((parameter) => ({ value: parameter.name, label: parameter.name }))}
      onChange={(name) => {
        onChange({ ...binding, name });
      }}
    />
  );
}

function BindingSource({ binding, catalog, onChange }: BindingSourceProps): ReactNode {
  switch (binding.source) {
    case 'literal':
      return (
        <TypedLiteral
          kind={binding.kind}
          value={binding.value}
          catalog={catalog}
          onChange={(value) => {
            onChange({ ...binding, value });
          }}
        />
      );
    case 'value':
      return (
        <Select
          label="Value"
          searchable
          value={binding.valueId}
          options={(catalog.values ?? [])
            .filter((row) => row.content.kind === binding.kind)
            .map((row) => ({ value: row.id, label: row.content.name }))}
          onChange={(id) => {
            const row = catalog.values?.find((entry) => entry.id === id);
            if (row !== undefined) onChange({ ...binding, valueId: row.id });
          }}
        />
      );
    case 'parameter':
      return <ParameterBinding binding={binding} catalog={catalog} onChange={onChange} />;
    case 'capability':
      return (
        <TargetFields
          devices={catalog.devices}
          usable={(device) => inputCapabilities(device, binding.kind)}
          deviceId={binding.deviceId}
          capability={binding.capability}
          onTarget={(device, capability) => {
            onChange({ ...binding, deviceId: device.id, capability: capability.key });
          }}
        />
      );
  }
}

interface BindingFieldsProps {
  readonly input: AutomationInput;
  readonly catalog: Catalog;
  readonly onChange: (input: AutomationInput) => void;
  readonly fixedKind?: AutomationBindingKind;
  readonly literal?: ReactNode;
}

function BindingKind({ input, fixedKind, onChange }: BindingFieldsProps): ReactNode {
  if (fixedKind !== undefined) return null;
  return (
    <Select
      label="Input type"
      value={input.binding.kind}
      options={AUTOMATION_BINDING_KIND.options.map((value) => ({ value, label: value }))}
      onChange={(kind) => {
        onChange(literalInput(kind));
      }}
    />
  );
}

function BindingFeedback({ input, catalog, onChange }: BindingFieldsProps): ReactNode {
  const problem = bindingProblem(catalog, input.binding);
  const kind = input.binding.kind;
  return (
    <>
      {problem === null ? null : (
        <Text variant="callout" tone="critical">
          {problem}
        </Text>
      )}
      {kind === 'number' || kind === 'duration' ? (
        <InputOffsetFields input={input} onChange={onChange} />
      ) : null}
    </>
  );
}

export function BindingFields({
  input,
  catalog,
  onChange,
  fixedKind,
  literal,
}: BindingFieldsProps): ReactNode {
  const kind = fixedKind ?? input.binding.kind;
  const sources = bindingSourceChoices(catalog, kind);
  return (
    <View className="gap-3">
      <BindingKind
        input={input}
        catalog={catalog}
        onChange={onChange}
        {...(fixedKind === undefined ? {} : { fixedKind })}
      />
      <Select
        label="Use"
        value={input.binding.source}
        options={sources}
        onChange={(source) => {
          const selected = sources.find((choice) => choice.value === source);
          if (selected !== undefined) onChange({ binding: selected.binding });
        }}
      />
      {input.binding.source === 'literal' && literal !== undefined ? (
        literal
      ) : (
        <BindingSource
          binding={input.binding}
          catalog={catalog}
          onChange={(binding) => {
            onChange({ ...input, binding });
          }}
        />
      )}
      <BindingLibraryButtons input={input} catalog={catalog} kind={kind} onChange={onChange} />
      <BindingFeedback input={input} catalog={catalog} onChange={onChange} />
      <Text variant="footnote" tone="variant">
        Inputs are resolved when this step runs. A missing or incompatible source stops the run.
      </Text>
    </View>
  );
}
