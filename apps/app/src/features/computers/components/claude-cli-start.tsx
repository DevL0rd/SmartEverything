import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  AI_CHAT_TITLE_MAX,
  type ClaudeCliStart as StartBody,
  type ClaudeSession,
  type ComputerAiStatus,
  type ComputerAiModel,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useComputerModels } from '../data/computer-ai';
import { useNativeStart } from '../data/native-start';
import { QueryState } from './query-state';
import { ClaudeCliStartFeedback } from './claude-cli-start-feedback';
import { background } from '@smarteverything/logging';

export function ClaudeCliStart({
  status,
  continueFrom,
}: {
  readonly status: ComputerAiStatus;
  readonly continueFrom?: ClaudeSession;
}): ReactNode {
  const { models, choices, model, select } = useModelChoice(status);
  const [folder, setFolder] = useState(initialFolder(status, continueFrom));
  const [text, setText] = useState('');
  const start = useNativeStart(status.device_id);
  const blocked = start.submission !== null && start.submission.state !== 'rejected';
  return (
    <View className="gap-4">
      <QueryState
        error={models.error}
        pending={models.isPending}
        retry={() => {
          background(models.refetch(), 'models.refetch_failed');
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
        folderLocked={continueFrom !== undefined}
      />
      <StartButton
        status={status}
        model={model}
        continueFrom={continueFrom}
        folder={folder}
        text={text}
        blocked={blocked}
        start={start}
      />
      <ClaudeCliStartFeedback start={start} />
      <Text tone="variant">{startNote(continueFrom)}</Text>
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
  folderLocked,
}: {
  readonly folder: string;
  readonly setFolder: (value: string) => void;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly blocked: boolean;
  readonly folderLocked: boolean;
}): ReactNode {
  return (
    <>
      <TextField
        label="Existing folder on this computer"
        value={folder}
        onChange={setFolder}
        helper="Enter an absolute path; the selected computer validates it."
        disabled={blocked || folderLocked}
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
  continueFrom,
}: {
  readonly status: ComputerAiStatus;
  readonly continueFrom: ClaudeSession | undefined;
  readonly model: ComputerAiModel | undefined;
  readonly folder: string;
  readonly text: string;
  readonly blocked: boolean;
  readonly start: ReturnType<typeof useNativeStart>;
}): ReactNode {
  return (
    <Button
      label={continueFrom === undefined ? 'Start CLI session' : 'Continue in app'}
      loading={start.mutation.isPending}
      disabled={startDisabled({ status, missingModel: model === undefined, folder, text, blocked })}
      onPress={() => {
        if (model !== undefined)
          start.mutation.mutate({
            model: model.id,
            effort: null,
            settings: { ...status.settings.provider.options, cwd: folder.trim() },
            message: { text, attachments: [] },
            ...continuation(continueFrom),
          });
      }}
    />
  );
}

function continuation(
  session: ClaudeSession | undefined,
): Partial<Pick<StartBody, 'continue_from' | 'title'>> {
  if (session === undefined) return {};
  return {
    continue_from: { session_id: session.id },
    ...(session.title === null ? {} : { title: session.title.slice(0, AI_CHAT_TITLE_MAX) }),
  };
}

function initialFolder(status: ComputerAiStatus, continueFrom: ClaudeSession | undefined): string {
  return continueFrom?.cwd ?? status.settings.provider.options.cwd ?? '';
}

function startNote(continueFrom: ClaudeSession | undefined): string {
  return continueFrom === undefined
    ? 'The first prompt runs in an owned shared chat on this computer. Open that chat for messages, permissions, questions, tasks and native controls.'
    : 'This continues a copy of the session in a new shared chat. The original session stays untouched.';
}

function useModelChoice(status: ComputerAiStatus): {
  readonly models: ReturnType<typeof useComputerModels>;
  readonly choices: readonly ComputerAiModel[];
  readonly model: ComputerAiModel | undefined;
  readonly select: (id: string) => void;
} {
  const models = useComputerModels(
    status.device_id,
    status.online && status.settings.provider.enabled,
  );
  const [selected, select] = useState('');
  const choices = (models.data ?? []).filter((row) => row.available);
  return {
    models,
    choices,
    model: choices.find((row) => row.id === selected) ?? choices[0],
    select,
  };
}
