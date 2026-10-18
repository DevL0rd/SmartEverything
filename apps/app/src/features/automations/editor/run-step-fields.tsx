import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { InputDeclarationV2, InputV2, StepV2 } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import type { Catalog } from '../data/use-automations';
import { runStepFor } from '../model/blanks';
import { defaultLiteral } from '../model/inputs';
import { calleeOf } from '../model/reusable-steps';
import { InputField } from './input-field';
import { ReusableLibraryButtons } from './library-buttons';

type RunStep = Extract<StepV2, { do: 'run' }>;

function CalleeInput({
  catalog,
  declared,
  input,
  onChange,
}: {
  readonly catalog: Catalog;
  readonly declared: InputDeclarationV2;
  readonly input: InputV2;
  readonly onChange: (input: InputV2) => void;
}): ReactNode {
  return (
    <InputField
      catalog={catalog}
      label={declared.name}
      shape={{ type: 'kind', kind: declared.type }}
      input={input}
      onChange={onChange}
    />
  );
}

interface RunFieldsProps {
  readonly catalog: Catalog;
  readonly step: RunStep;
  readonly onChange: (step: RunStep) => void;
}

function CalleePicker({ catalog, step, onChange }: RunFieldsProps): ReactNode {
  const row = catalog.automations.find((entry) => entry.id === step.automation) ?? null;
  return (
    <>
      <Select
        label="Run"
        searchable
        value={
          catalog.callable.some((entry) => entry.id === step.automation) ? step.automation : null
        }
        placeholder="Pick what to run"
        options={catalog.callable.map((entry) => ({
          value: entry.id,
          label: entry.name,
          description: entry.reusable ? 'Reusable steps' : 'Automation',
        }))}
        onChange={(id) => {
          const next = catalog.callable.find((entry) => entry.id === id);
          if (next !== undefined) onChange({ ...runStepFor(next), id: step.id, wait: step.wait });
        }}
      />
      <ReusableLibraryButtons
        row={row}
        onSelect={(selected) => {
          const callee = calleeOf(selected);
          if (callee !== null) onChange({ ...runStepFor(callee), id: step.id });
        }}
      />
    </>
  );
}

function CalleeDetail({ catalog, step, onChange }: RunFieldsProps): ReactNode {
  const callee = catalog.callable.find((entry) => entry.id === step.automation);
  const given = step.inputs ?? {};
  if (callee === undefined)
    return (
      <Text variant="callout" tone="critical">
        This was deleted. Pick something else to run.
      </Text>
    );
  return (
    <>
      <SwitchRow
        title="Wait for it to finish"
        subtitle="Off starts it and carries on right away."
        value={step.wait === true}
        onChange={(wait) => {
          const { wait: _wait, ...rest } = step;
          onChange(wait ? { ...rest, wait } : rest);
        }}
      />
      {callee.inputs.map((declared) => (
        <CalleeInput
          key={declared.name}
          catalog={catalog}
          declared={declared}
          input={given[declared.name] ?? defaultLiteral(declared.type)}
          onChange={(input) => {
            onChange({ ...step, inputs: { ...given, [declared.name]: input } });
          }}
        />
      ))}
    </>
  );
}

export function RunStepFields(props: RunFieldsProps): ReactNode {
  return (
    <View className="gap-3">
      <CalleePicker {...props} />
      <CalleeDetail {...props} />
    </View>
  );
}
