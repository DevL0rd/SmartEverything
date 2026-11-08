import { createElement, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiMemoryList } from '@smarteverything/domain';
import { LoadedQuery } from '../../../components/loaded-query';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import type { SettingDefinition } from '../../../settings/types';
import { useMutationState } from '../../../store/mutation';
import { useMemoryActions, useMemoryList, useMemorySession } from './memory-data';
import { MEMORY_SCOPES, promptCharsOf } from './memory-model';
import { MemorySection } from './memory-section';

const PROMPT_LENGTH_DIGITS = String(Number.MAX_SAFE_INTEGER).length;

function EnabledRow({ list }: { readonly list: AiMemoryList }): ReactNode {
  const actions = useMemoryActions();
  const mutation = useMutationState();
  return (
    <List inset>
      <SwitchRow
        title="Remember things between chats"
        subtitle="The AI learns and recalls short facts across chats. Turning this off keeps your saved memories."
        wrapSubtitle
        icon="lightbulb"
        value={list.settings.enabled}
        disabled={mutation.busy}
        onChange={(enabled) => {
          mutation.run(() => actions.settings({ enabled }), { failure: 'Memory was not changed' });
        }}
      />
      <PromptSizeRow list={list} />
    </List>
  );
}

function PromptSizeRow({ list }: { readonly list: AiMemoryList }): ReactNode {
  const actions = useMemoryActions();
  const [open, setOpen] = useState(false);
  const chars = list.settings.prompt_chars;
  return (
    <>
      <NavRow
        title="Memory limit per reply"
        subtitle="How many characters of memories the AI can use each time it replies"
        wrapSubtitle
        icon="fileText"
        value={chars === null ? 'Default' : `${String(chars)} characters`}
        onPress={() => {
          setOpen(true);
        }}
      />
      <TextEditSheet
        request={
          open
            ? {
                id: 'memory-prompt-chars',
                title: 'Memory limit per reply',
                label: 'Characters of memories',
                initial: chars === null ? '' : String(chars),
                placeholder: 'Leave blank to use the default',
                confirmLabel: 'Save',
                maxLength: PROMPT_LENGTH_DIGITS,
                kind: 'number',
                allowEmpty: true,
                problemOf: (value) =>
                  promptCharsOf(value) === undefined ? 'Use a whole number above 0' : null,
                save: (value) => actions.settings({ prompt_chars: promptCharsOf(value) ?? null }),
              }
            : null
        }
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function Loading(): ReactNode {
  return (
    <View className="gap-section-gap">
      <Skeleton shape="block" className="h-16" />
      <Skeleton shape="block" className="h-40" />
    </View>
  );
}

export function MemoryPage(): ReactNode {
  const session = useMemorySession();
  return (
    <LoadedQuery query={useMemoryList(session)} loading={<Loading />}>
      {(list) => (
        <View key={session.key} className="gap-section-gap">
          <EnabledRow list={list} />
          {MEMORY_SCOPES.map((scope) => (
            <MemorySection key={scope} scope={scope} list={list} />
          ))}
        </View>
      )}
    </LoadedQuery>
  );
}

export const MEMORY_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'assistant.memory',
    page: 'assistant/memory',
    title: 'What the AI remembers',
    keywords: ['memory', 'remember', 'memories', 'forget', 'forget everything', 'facts'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(MemoryPage),
  },
];
