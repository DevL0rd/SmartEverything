import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerAiStatus, ComputerAiModel } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useComputerModels } from '../data/computer-ai';
import { useNativeStart } from '../data/native-start';
import { QueryState } from './query-state';
import { ClaudeCliStartFeedback } from './claude-cli-start-feedback';

export function ClaudeCliStart({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const enabled = status.online && status.settings.provider.enabled;
  const models = useComputerModels(status.device_id, enabled);
  const [selected, select] = useState('');
  const [folder, setFolder] = useState(status.settings.provider.options.cwd ?? '');
  const [text, setText] = useState('');
  const start = useNativeStart(status.device_id);
  const choices = (models.data ?? []).filter((model) => model.available);
  const model = choices.find((row) => row.id === selected) ?? choices[0];
  const blocked = start.submission !== null && start.submission.state !== 'rejected';
  return (
    <View className="gap-4">
      <QueryState
        error={models.error}
        pending={models.isPending}
        retry={() => {
          void models.refetch();
        }}
      />
      <SelectRow
        title="Claude model"
        value={model?.id ?? ''}
        options={choices.map((row) => ({ value: row.id, label: row.name }))}
        onChange={select}
        disabled={blocked}
      />
      <StartFields
        folder={folder}
        setFolder={setFolder}
        text={text}
        setText={setText}
        blocked={blocked}
      />
      <StartButton
        status={status}
        model={model}
        folder={folder}
        text={text}
        blocked={blocked}
        start={start}
      />
      <ClaudeCliStartFeedback start={start} />
      <Text tone="variant">
        The first prompt runs in an owned shared chat on this computer. Open that chat for messages,
        permissions, questions, tasks and native controls.
      </Text>
    </View>
  );
}

function startDisabled({
  status,
  missingModel,
  folder,
  text,
  blocked,
}: {
  readonly status: ComputerAiStatus;
  readonly missingModel: boolean;
  readonly folder: string;
  readonly text: string;
  readonly blocked: boolean;
}): boolean {
  return (
    !status.online ||
    !status.settings.provider.enabled ||
    missingModel ||
    folder.trim() === '' ||
    text.trim() === '' ||
    blocked
  );
}

function StartFields({
  folder,
  setFolder,
  text,
  setText,
  blocked,
}: {
  readonly folder: string;
  readonly setFolder: (value: string) => void;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly blocked: boolean;
}): ReactNode {
  return (
    <>
      <TextField
        label="Existing folder on this computer"
        value={folder}
        onChange={setFolder}
        helper="Enter an absolute path; the selected computer validates it."
        disabled={blocked}
      />
      <TextField
        label="First prompt"
        multiline
        value={text}
        onChange={setText}
        disabled={blocked}
      />
    </>
  );
}

function StartButton({
  status,
  model,
  folder,
  text,
  blocked,
  start,
}: {
  readonly status: ComputerAiStatus;
  readonly model: ComputerAiModel | undefined;
  readonly folder: string;
  readonly text: string;
  readonly blocked: boolean;
  readonly start: ReturnType<typeof useNativeStart>;
}): ReactNode {
  return (
    <Button
      label="Start CLI session"
      loading={start.mutation.isPending}
      disabled={startDisabled({ status, missingModel: model === undefined, folder, text, blocked })}
      onPress={() => {
        if (model !== undefined)
          start.mutation.mutate({
            model: model.id,
            effort: null,
            settings: { ...status.settings.provider.options, cwd: folder.trim() },
            message: { text, attachments: [] },
          });
      }}
    />
  );
}
