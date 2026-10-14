import { useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { View } from 'react-native';
import type {
  ComputerRuntimeStatus,
  CodexProviderOptions,
  ComputerRuntimeModel,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useCodexRead, useCodexExecute } from '../data/computer-runtime';
import { useCodexOperation } from '../data/codex-operation';
import { CodexOptions } from './codex-options';
import { NativeOperationFeedback } from './native-operation';
export function CodexNativeStart({
  status,
}: {
  readonly status: ComputerRuntimeStatus;
}): ReactNode {
  const models = useCodexRead(status.device_id, { operation: 'models' }, true);
  const [selected, select] = useState('');
  const [effort, setEffort] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [options, setOptions] = useState<CodexProviderOptions>(
    status.settings.runtime === 'codex' ? status.settings.settings.provider.options : {},
  );
  const execute = useCodexExecute(status.device_id);
  const operation = useCodexOperation(
    status.device_id,
    execute.data,
    execute.variables,
    execute.error,
  );
  const choices =
    models.data?.operation === 'models' ? models.data.value.filter((model) => model.available) : [];
  const model = choices.find((row) => row.id === selected) ?? choices[0];
  return (
    <View className="gap-3">
      <StartModel
        choices={choices}
        model={model}
        select={select}
        effort={effort}
        setEffort={setEffort}
      />
      <TextField label="First prompt" value={text} onChange={setText} multiline />
      <StartOptions options={options} setOptions={setOptions} blocked={operation.blocked} />
      <StartButton
        model={model}
        text={text}
        blocked={operation.blocked}
        status={status}
        execute={execute}
        effort={effort}
        options={options}
      />
      <NativeOperationFeedback operation={operation} />
    </View>
  );
}

function StartModel({
  choices,
  model,
  select,
  effort,
  setEffort,
}: {
  readonly choices: readonly ComputerRuntimeModel[];
  readonly model: ComputerRuntimeModel | undefined;
  readonly select: (value: string) => void;
  readonly effort: string | null;
  readonly setEffort: (value: string | null) => void;
}): ReactNode {
  return (
    <>
      <SelectRow
        title="Codex model"
        value={model?.id ?? ''}
        options={choices.map((row) => ({ value: row.id, label: row.name }))}
        onChange={(value) => {
          select(value);
          setEffort(null);
        }}
      />
      <SelectRow
        title="Thinking effort"
        value={effort ?? ''}
        options={[
          { value: '', label: 'Runtime default' },
          ...(model?.efforts ?? []).map((value) => ({ value, label: value })),
        ]}
        onChange={(value) => {
          setEffort(value === '' ? null : value);
        }}
      />
    </>
  );
}

function StartButton({
  model,
  text,
  blocked,
  status,
  execute,
  effort,
  options,
}: {
  readonly model: ComputerRuntimeModel | undefined;
  readonly text: string;
  readonly blocked: boolean;
  readonly status: ComputerRuntimeStatus;
  readonly execute: ReturnType<typeof useCodexExecute>;
  readonly effort: string | null;
  readonly options: CodexProviderOptions;
}): ReactNode {
  return (
    <Button
      label="Start native Codex session"
      loading={execute.isPending}
      disabled={
        model === undefined ||
        text.trim() === '' ||
        blocked ||
        !status.capabilities.operations.includes('start')
      }
      onPress={() => {
        if (model !== undefined)
          execute.mutate({
            operation: 'start',
            operation_id: randomUUID(),
            start: { model: model.id, effort, text, options },
          });
      }}
    />
  );
}

function StartOptions({
  options,
  setOptions,
  blocked,
}: {
  readonly options: CodexProviderOptions;
  readonly setOptions: (value: CodexProviderOptions) => void;
  readonly blocked: boolean;
}): ReactNode {
  return (
    <>
      <CodexOptions options={options} save={setOptions} pending={false} disabled={blocked} />
      <Text tone="variant">
        Saved options above apply to this native start. An empty folder creates a private workspace
        on this computer.
      </Text>
    </>
  );
}
