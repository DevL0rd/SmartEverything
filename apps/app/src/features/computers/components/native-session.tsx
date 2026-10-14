import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { type ClaudeSession, type ClaudeThreadItem } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useNativeThread } from '../data/native-session';
import { QueryState } from './query-state';

interface SessionProps {
  readonly deviceId: string;
  readonly session: ClaudeSession;
}

function ThreadItem({ item }: { readonly item: ClaudeThreadItem }): ReactNode {
  const text =
    item.kind === 'tool_use' ? item.input : item.kind === 'other' ? item.block : item.text;
  return (
    <View className="gap-2 rounded-lg bg-surface-2 p-4">
      <Text variant="footnote" tone="variant">
        {item.kind === 'tool_use' ? item.tool_name : item.kind.replaceAll('_', ' ')}
        {item.truncated ? ' · truncated' : ''}
        {item.sidechain ? ' · sidechain' : ''}
      </Text>
      <Text selectable>{text}</Text>
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
  const [before, setBefore] = useState<string | undefined>(undefined);
  const thread = useNativeThread(deviceId, sessionId, before);
  const page = thread.data;
  const older = page?.older;
  return (
    <View className="gap-3">
      <QueryState
        error={thread.error}
        pending={thread.isPending}
        retry={() => {
          void thread.refetch();
        }}
      />
      {older === null || older === undefined ? null : (
        <Button
          label="Older messages"
          variant="tonal"
          onPress={() => {
            setBefore(older);
          }}
        />
      )}
      {before === undefined ? null : (
        <Button
          label="Latest messages"
          variant="text"
          onPress={() => {
            setBefore(undefined);
          }}
        />
      )}
      {(page?.items ?? []).map((item) => (
        <ThreadItem key={item.id} item={item} />
      ))}
      {page === undefined || page.skipped === 0 ? null : (
        <Text tone="warning">{page.skipped} unreadable transcript rows skipped.</Text>
      )}
    </View>
  );
}

export function NativeSession({ deviceId, session }: SessionProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <Text tone="variant">
        {session.cwd ?? 'Working directory unavailable'} · {session.state}
      </Text>
      <Text tone="variant">
        Legacy history is read-only. This record has no verified owned shared chat; start a new CLI
        session to work through SmartEverything.
      </Text>
      <NativeThread deviceId={deviceId} sessionId={session.id} />
    </View>
  );
}
