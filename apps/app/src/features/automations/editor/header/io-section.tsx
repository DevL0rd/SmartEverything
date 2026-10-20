import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { InputPort, OutputPort } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { Button } from '../../../../components/button';
import { IconButton } from '../../../../components/icon-button';
import { SelectRow, SwitchRow } from '../../../../components/rows';
import { List, Section } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { CommittedField } from '../inspector/sections/committed-field';
import { controlOf } from '../inspector/schema-fields';
import { LiteralEditor } from '../inspector/values/literal-editor';
import type { HeaderEnv, HeaderSectionProps } from './header-types';
import {
  addInput,
  addOutput,
  defaultInput,
  inputLine,
  optionalOutput,
  outputLine,
  portProblem,
  relabelInput,
  removeInput,
  removeOutput,
  renameInput,
  renameOutput,
  requireInput,
  retypeInput,
  retypeOutput,
} from './io-model';
import { inputInUse, outputInUse, renameBlocked } from './usage';
import { TYPE_OPTIONS, typeValueOf } from './type-choices';

const TYPE_CHOICES = TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

function inputNameRows(env: HeaderEnv, input: InputPort): ReactNode[] {
  const { inputs } = env.program;
  return [
    <View key="name" className="gap-3 px-4 py-3">
      <CommittedField
        label="Name"
        value={input.name}
        disabled={env.locked}
        validate={(text) =>
          text !== input.name && inputInUse(env.program, input.name)
            ? renameBlocked('input', input.name)
            : portProblem(inputs, input.name, text)
        }
        onCommit={(text) => {
          env.apply([renameInput(inputs, input.name, text)]);
        }}
      />
      <CommittedField
        label="Shown as"
        value={input.label ?? ''}
        disabled={env.locked}
        onCommit={(text) => {
          env.apply([relabelInput(inputs, input.name, text)]);
        }}
      />
    </View>,
    <SelectRow
      key="type"
      title="Kind of value"
      value={typeValueOf(input.type)}
      disabled={env.locked}
      options={TYPE_CHOICES}
      onChange={(value) => {
        env.apply([retypeInput(inputs, input.name, value)]);
      }}
    />,
  ];
}

function inputRequiredRows(env: HeaderEnv, input: InputPort): ReactNode[] {
  const { inputs } = env.program;
  const rows: ReactNode[] = [
    <SwitchRow
      key="required"
      title="Every run must give it"
      subtitle="When off, a run can leave it out and use the start value below."
      wrapSubtitle
      value={input.required}
      disabled={env.locked}
      onChange={(required) => {
        env.apply([requireInput(inputs, input.name, required)]);
      }}
    />,
  ];
  if (!input.required) {
    rows.push(
      <View key="default" className="px-4 py-3">
        <LiteralEditor
          control={controlOf(input.type)}
          label={`Start value of ${input.name}`}
          value={input.default}
          disabled={env.locked}
          onChange={(value) => {
            env.apply([defaultInput(inputs, input.name, value)]);
          }}
        />
      </View>,
    );
  }
  return rows;
}

function RemoveButton({
  env,
  label,
  op,
}: {
  readonly env: HeaderEnv;
  readonly label: string;
  readonly op: PatchOp;
}): ReactNode {
  return (
    <IconButton
      icon="trash"
      label={label}
      disabled={env.locked}
      onPress={() => {
        env.apply([op]);
      }}
    />
  );
}

function InputCard({
  env,
  input,
}: {
  readonly env: HeaderEnv;
  readonly input: InputPort;
}): ReactNode {
  return (
    <List
      title={input.label ?? input.name}
      caption={inputLine(input)}
      action={
        <RemoveButton
          env={env}
          label={`Remove input ${input.name}`}
          op={removeInput(env.program.inputs, input.name)}
        />
      }
    >
      {inputNameRows(env, input)}
      {inputRequiredRows(env, input)}
    </List>
  );
}

function outputRows(env: HeaderEnv, output: OutputPort): ReactNode[] {
  const { outputs } = env.program;
  return [
    <View key="name" className="px-4 py-3">
      <CommittedField
        label="Name"
        value={output.name}
        disabled={env.locked}
        validate={(text) =>
          text !== output.name && outputInUse(env.program, output.name)
            ? renameBlocked('result', output.name)
            : portProblem(outputs, output.name, text)
        }
        onCommit={(text) => {
          env.apply([renameOutput(outputs, output.name, text)]);
        }}
      />
    </View>,
    <SelectRow
      key="type"
      title="Kind of value"
      value={typeValueOf(output.type)}
      disabled={env.locked}
      options={TYPE_CHOICES}
      onChange={(value) => {
        env.apply([retypeOutput(outputs, output.name, value)]);
      }}
    />,
    <SwitchRow
      key="optional"
      title="May be missing"
      subtitle="A run can finish without giving this back."
      wrapSubtitle
      value={output.optional === true}
      disabled={env.locked}
      onChange={(optional) => {
        env.apply([optionalOutput(outputs, output.name, optional)]);
      }}
    />,
  ];
}

function OutputCard({
  env,
  output,
}: {
  readonly env: HeaderEnv;
  readonly output: OutputPort;
}): ReactNode {
  return (
    <List
      title={output.label ?? output.name}
      caption={outputLine(output)}
      action={
        <RemoveButton
          env={env}
          label={`Remove output ${output.name}`}
          op={removeOutput(env.program.outputs, output.name)}
        />
      }
    >
      {outputRows(env, output)}
    </List>
  );
}

export function InputsSection({ env }: HeaderSectionProps): ReactNode {
  const { inputs } = env.program;
  return (
    <Section title="Inputs" caption="Values a caller can hand to a run">
      <View className="gap-4">
        {inputs.length === 0 ? (
          <Text variant="footnote" tone="variant" className="px-4">
            No inputs. A run uses only what its trigger gives it.
          </Text>
        ) : (
          inputs.map((input) => <InputCard key={input.name} env={env} input={input} />)
        )}
        <View className="flex-row px-4">
          <Button
            label="Add input"
            icon="plus"
            variant="tonal"
            disabled={env.locked}
            onPress={() => {
              env.apply([addInput(inputs)]);
            }}
          />
        </View>
      </View>
    </Section>
  );
}

export function OutputsSection({ env }: HeaderSectionProps): ReactNode {
  const { outputs } = env.program;
  return (
    <Section title="Outputs" caption="Values a run gives back">
      <View className="gap-4">
        {outputs.length === 0 ? (
          <Text variant="footnote" tone="variant" className="px-4">
            No outputs. A run gives nothing back to its caller.
          </Text>
        ) : (
          outputs.map((output) => <OutputCard key={output.name} env={env} output={output} />)
        )}
        <View className="flex-row px-4">
          <Button
            label="Add output"
            icon="plus"
            variant="tonal"
            disabled={env.locked}
            onPress={() => {
              env.apply([addOutput(outputs)]);
            }}
          />
        </View>
      </View>
    </Section>
  );
}
