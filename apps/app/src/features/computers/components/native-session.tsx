import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  type ClaudeSession,
  type ClaudeThreadItem,
  type ComputerAiStatus,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useNativeThread } from '../data/native-session';
import { ClaudeCliStart } from './claude-cli-start';
import { QueryState } from './query-state';
import { background } from '@smarteverything/logging';

export type ContinueAccess = { readonly status: ComputerAiStatus } | { readonly reason: string };

interface SessionProps {
  readonly deviceId: string;
  readonly session: ClaudeSession;
  readonly access: ContinueAccess;
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
          background(thread.refetch(), 'thread.refetch_failed');
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

function ContinueInApp({
  session,
  access,
}: {
  readonly session: ClaudeSession;
  readonly access: ContinueAccess;
}): ReactNode {
  const [continuing, setContinuing] = useState(false);
  if ('reason' in access) return <Text tone="variant">{access.reason}</Text>;
  if (session.cwd === null)
    return <Text tone="variant">This session has no folder, so it can’t be continued here.</Text>;
  if (continuing) return <ClaudeCliStart status={access.status} continueFrom={session} />;
  return (
    <Button
      label="Continue in app"
      onPress={() => {
        setContinuing(true);
      }}
    />
  );
}

export function NativeSession({ deviceId, session, access }: SessionProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <Text tone="variant">
        {session.cwd ?? 'Working directory unavailable'} · {session.state}
      </Text>
      <Text tone="variant">
        This history is read-only. Continue in app copies it into a new shared chat and leaves the
        original session untouched.
      </Text>
      <ContinueInApp session={session} access={access} />
      <NativeThread deviceId={deviceId} sessionId={session.id} />
    </View>
  );
}
