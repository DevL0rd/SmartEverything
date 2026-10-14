import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ComputerAiStatus, ClaudeSession } from '@smarteverything/domain';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useIsOwner } from '../../../store/selectors';
import { useNativeSessions } from '../data/computer-ai';
import { NativeTools } from './native-tools';
import { QueryState } from './query-state';

export function attachedCliToolsReady(status: ComputerAiStatus): boolean {
  return (
    status.online &&
    status.settings.control.enabled &&
    ['sessions', 'native_tools_list', 'native_tools_call'].every((operation) =>
      status.capabilities.operations.some((available) => available === operation),
    )
  );
}
export function AttachedCliTools({ status }: { readonly status: ComputerAiStatus }): ReactNode {
  const owner = useIsOwner();
  const enabled = owner && attachedCliToolsReady(status);
  const sessions = useNativeSessions(status.device_id, false, enabled);
  const [chosen, choose] = useState<string | null>(null);
  const live = (sessions.data ?? []).filter((session) => session.state !== 'stopped');
  const current = enabled ? live.find((session) => session.id === chosen) : undefined;
  return (
    <>
      <QueryState
        error={sessions.error}
        pending={enabled ? sessions.isPending : false}
        retry={() => {
          void sessions.refetch();
        }}
      />
      <Text tone="variant">
        Choose a live native session to verify its current attachment and exact tool schemas. This
        view never starts or resumes a session.
      </Text>
      <AttachedSessionRows sessions={live} choose={choose} enabled={enabled} />
      {current === undefined ? null : (
        <NativeTools key={current.id} deviceId={status.device_id} sessionId={current.id} />
      )}
      {enabled ? null : (
        <Text tone="variant">
          Attached tools require current owner access, an online computer and enabled native
          tool-list/call capabilities.
        </Text>
      )}
    </>
  );
}
function AttachedSessionRows({
  sessions,
  choose,
  enabled,
}: {
  readonly sessions: readonly ClaudeSession[];
  readonly choose: (id: string) => void;
  readonly enabled: boolean;
}): ReactNode {
  return (
    <List title="Live native sessions">
      {sessions.map((session) => (
        <NavRow
          key={session.id}
          title={session.title ?? 'Untitled native session'}
          subtitle={`${session.state} · ${session.cwd ?? 'Folder unavailable'}`}
          disabled={!enabled}
          onPress={() => {
            choose(session.id);
          }}
        />
      ))}
      {sessions.length === 0 ? (
        <Text tone="variant">No live native sessions in this view.</Text>
      ) : null}
    </List>
  );
}
