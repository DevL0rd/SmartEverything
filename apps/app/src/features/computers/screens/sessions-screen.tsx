import { SubscriptionUsageBars, claudeSubscriptionWindows } from '../../assistant';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ClaudeSession, ComputerAiStatus, ClaudeUsage } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { useRevealed } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { useIsOwner, useDevice } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { ClaudeCliStart } from '../components/claude-cli-start';
import { NativeSession, type ContinueAccess } from '../components/native-session';
import { ProviderReasonNotice } from '../components/provider-reason-notice';
import { canStart, continueAccess, startReason } from '../model/continue-access';
import { QueryState } from '../components/query-state';
import { useComputerAi, useNativeSessions, useNativeStatus } from '../data/computer-ai';
import { useClaudeCliSessions } from '../data/claude-cli-sessions';
import { background } from '@smarteverything/logging';

function ManagedSessions({
  deviceId,
  archived,
  owner,
}: {
  readonly deviceId: string;
  readonly archived: boolean;
  readonly owner: boolean;
}): ReactNode {
  const sessions = useClaudeCliSessions(deviceId, archived, owner);
  const revealed = useRevealed(sessions.data ?? []);
  return (
    <>
      <QueryState
        error={sessions.error}
        pending={owner ? sessions.isPending : false}
        retry={() => {
          background(sessions.refetch(), 'sessions.refetch_failed');
        }}
      />
      <List title="Claude sessions" footer="Open a session to see its chat.">
        {revealed.shown.map((session) => (
          <NavRow
            key={session.chat.id}
            title={session.chat.title}
            subtitle={`${session.provider.state} · ${session.cwd}`}
            value={session.online ? '' : 'Offline'}
            href={href.assistantChat(session.chat.id)}
          />
        ))}
        {revealed.more}
      </List>
      {sessions.data?.length === 0 ? <Text tone="variant">No Claude sessions here.</Text> : null}
    </>
  );
}

function LegacySessions({
  deviceId,
  archived,
  enabled,
  access,
}: {
  readonly deviceId: string;
  readonly archived: boolean;
  readonly enabled: boolean;
  readonly access: ContinueAccess;
}): ReactNode {
  const sessions = useNativeSessions(deviceId, archived, enabled);
  const [chosen, choose] = useState<ClaudeSession | null>(null);
  const native = useNativeStatus(deviceId, enabled);
  return (
    <>
      <QueryState
        error={sessions.error}
        pending={enabled ? sessions.isPending : false}
        retry={() => {
          background(sessions.refetch(), 'sessions.refetch_failed');
        }}
      />
      <LegacyRows sessions={sessions.data} choose={choose} />
      <LegacyNativeUsage deviceId={deviceId} usage={native.data?.usage} />
      {enabled ? null : (
        <Text tone="variant">
          Connect this computer and turn on Earlier Claude history to read it.
        </Text>
      )}
      <Sheet
        open={chosen !== null}
        title={chosen?.title ?? 'Earlier Claude history'}
        onClose={() => {
          choose(null);
        }}
        detents={['full']}
      >
        {chosen === null ? null : (
          <NativeSession key={chosen.id} deviceId={deviceId} session={chosen} access={access} />
        )}
      </Sheet>
    </>
  );
}

function SessionList({
  deviceId,
  status,
  owner,
}: {
  readonly deviceId: string;
  readonly status: ComputerAiStatus | undefined;
  readonly owner: boolean;
}): ReactNode {
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const enabled = canStart(status, owner);
  return (
    <>
      <List>
        <SwitchRow title="Archived sessions" value={archived} onChange={setArchived} />
      </List>
      <Button
        label="New CLI session"
        disabled={!enabled}
        onPress={() => {
          setCreating(true);
        }}
      />
      {enabled ? null : (
        <ProviderReasonNotice deviceId={deviceId} reason={startReason(status, owner)} />
      )}
      <ManagedSessions deviceId={deviceId} archived={archived} owner={owner} />
      <LegacySessions
        deviceId={deviceId}
        archived={archived}
        enabled={legacyEnabled(status, owner)}
        access={continueAccess(status, owner)}
      />
      <CreateSheet
        creating={creating}
        status={status}
        close={() => {
          setCreating(false);
        }}
      />
    </>
  );
}

export function ComputerSessionsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const status = useComputerAi(deviceId);
  const owner = useIsOwner();
  return (
    <ComputerFrame deviceId={deviceId} title="Claude sessions">
      <QueryState
        error={status.error}
        pending={status.isPending}
        retry={() => {
          background(status.refetch(), 'status.refetch_failed');
        }}
      />
      <SessionList deviceId={deviceId} status={status.data} owner={owner} />
    </ComputerFrame>
  );
}

function LegacyRows({
  sessions,
  choose,
}: {
  readonly sessions: readonly ClaudeSession[] | undefined;
  readonly choose: (session: ClaudeSession) => void;
}): ReactNode {
  const revealed = useRevealed(sessions ?? []);
  return (
    <List
      title="Earlier Claude history"
      footer="Open a session from Claude Desktop or the terminal to read it or continue it in a new chat."
    >
      {revealed.shown.map((session) => (
        <NavRow
          key={session.id}
          title={session.title ?? 'Untitled session'}
          subtitle={`${session.state} · ${session.cwd ?? 'Folder unavailable'}`}
          onPress={() => {
            choose(session);
          }}
        />
      ))}
      {revealed.more}
    </List>
  );
}

function CreateSheet({
  creating,
  status,
  close,
}: {
  readonly creating: boolean;
  readonly status: ComputerAiStatus | undefined;
  readonly close: () => void;
}): ReactNode {
  const content = creating && status !== undefined ? <ClaudeCliStart status={status} /> : null;
  return (
    <Sheet open={creating} title="New CLI session" onClose={close} detents={['full']}>
      {content}
    </Sheet>
  );
}

function LegacyNativeUsage({
  deviceId,
  usage,
}: {
  readonly deviceId: string;
  readonly usage: ClaudeUsage | undefined;
}): ReactNode {
  const device = useDevice(deviceId);
  return (
    <SubscriptionUsageBars
      provider="Earlier Claude history"
      computer={device?.label ?? 'Computer unavailable'}
      windows={claudeSubscriptionWindows(usage)}
    />
  );
}

function legacyEnabled(status: ComputerAiStatus | undefined, owner: boolean): boolean {
  return owner && status?.online === true && status.settings.control.enabled;
}
