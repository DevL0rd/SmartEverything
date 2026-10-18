import type { z } from 'zod';
import { useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { View } from 'react-native';
import type {
  ComputerRuntimeCapabilities,
  CODEX_ITEM,
  CODEX_THREAD_PAGE,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { StructuredValue } from '../../../components/structured-value';
import { useCodexRead, useCodexExecute } from '../data/computer-runtime';
import { useCodexOperation } from '../data/codex-operation';
import { CodexPromptCard } from './codex-prompt';
import { NativeOperationFeedback } from './native-operation';
import { CodexSessionActions } from './codex-session-actions';
import { QueryState } from './query-state';
import { background } from '@smarteverything/logging';
function NativePrompts({
  deviceId,
  sessionId,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
}): ReactNode {
  const prompts = useCodexRead(deviceId, { operation: 'prompts', session_id: sessionId }, true);
  const execute = useCodexExecute(deviceId);
  const operation = useCodexOperation(deviceId, execute.data, execute.variables, execute.error);
  return (
    <View className="gap-3">
      <QueryState
        error={prompts.error}
        pending={prompts.isPending}
        retry={() => {
          background(prompts.refetch(), 'prompts.refetch_failed');
        }}
      />
      {prompts.data?.operation === 'prompts'
        ? prompts.data.value.map((prompt) => (
            <CodexPromptCard
              key={prompt.id}
              prompt={prompt}
              pending={execute.isPending || operation.blocked}
              answer={(answer) => {
                execute.mutate({
                  operation: 'answer',
                  operation_id: randomUUID(),
                  prompt_id: prompt.id,
                  answer,
                });
              }}
            />
          ))
        : null}
      <NativeOperationFeedback operation={operation} />
    </View>
  );
}
function NativeThread({
  deviceId,
  sessionId,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
}): ReactNode {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const thread = useCodexRead(
    deviceId,
    {
      operation: 'thread',
      session_id: sessionId,
      query: { limit: 50, ...(cursor === undefined ? {} : { cursor }) },
    },
    true,
  );
  const page = thread.data?.operation === 'thread' ? thread.data.value : null;
  return (
    <View className="gap-3">
      <Text variant="title-3">Session activity</Text>
      <QueryState
        error={thread.error}
        pending={thread.isPending}
        retry={() => {
          background(thread.refetch(), 'thread.refetch_failed');
        }}
      />
      <ThreadItems items={page?.items ?? []} />
      <ThreadPageControls page={page} cursor={cursor} setCursor={setCursor} />
    </View>
  );
}
export function CodexNativeSession({
  deviceId,
  sessionId,
  capabilities,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly capabilities: ComputerRuntimeCapabilities;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <Text selectable tone="variant">
        Native session {sessionId}
      </Text>
      <CodexSessionActions deviceId={deviceId} sessionId={sessionId} capabilities={capabilities} />
      <NativePrompts deviceId={deviceId} sessionId={sessionId} />
      <NativeThread deviceId={deviceId} sessionId={sessionId} />
    </View>
  );
}

function ThreadItems({
  items,
}: {
  readonly items: readonly z.output<typeof CODEX_ITEM>[];
}): ReactNode {
  return (
    <>
      {items.map((item) => (
        <View key={item.id} className="gap-2 rounded-lg bg-surface-2 p-4">
          <Text variant="footnote" tone="variant">
            {item.type}
            {item.unsupported ? ' · unsupported' : ''}
          </Text>
          {item.turn_id === null ? null : (
            <Text variant="caption" selectable tone="variant">
              Turn {item.turn_id}
            </Text>
          )}
          <StructuredValue value={item.payload} />
        </View>
      ))}
    </>
  );
}

function ThreadPageControls({
  page,
  cursor,
  setCursor,
}: {
  readonly page: z.output<typeof CODEX_THREAD_PAGE> | null;
  readonly cursor: string | undefined;
  readonly setCursor: (value: string | undefined) => void;
}): ReactNode {
  return (
    <>
      {page?.truncated === true ? <Text tone="warning">Older activity is not shown.</Text> : null}
      {page?.next_cursor === null || page === null ? null : (
        <Button
          label="Next activity page"
          variant="tonal"
          onPress={() => {
            setCursor(page.next_cursor ?? undefined);
          }}
        />
      )}
      {cursor === undefined ? null : (
        <Button
          label="Latest activity"
          variant="text"
          onPress={() => {
            setCursor(undefined);
          }}
        />
      )}
    </>
  );
}
