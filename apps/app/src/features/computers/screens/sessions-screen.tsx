import { SubscriptionUsageBars } from '../../assistant/provider/subscription-usage';
import { claudeSubscriptionWindows } from '../../assistant/provider/subscription-usage-values';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ClaudeSession, ComputerAiStatus, ClaudeUsage } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsOwner, useDevice } from '../../../store/selectors';
import { ComputerFrame } from '../components/computer-frame';
import { ClaudeCliStart } from '../components/claude-cli-start';
import { NativeSession } from '../components/native-session';
import { QueryState } from '../components/query-state';
import { useComputerAi, useNativeSessions, useNativeStatus } from '../data/computer-ai';
import { useClaudeCliSessions } from '../data/claude-cli-sessions';

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
  return (
    <>
      <QueryState
        error={sessions.error}
        pending={owner ? sessions.isPending : false}
        retry={() => {
          void sessions.refetch();
        }}
      />
      <List
        title="Owned CLI sessions"
        footer="Open the shared chat for history, approvals, questions, model, context and tasks."
      >
        {(sessions.data ?? []).map((session) => (
          <NavRow
            key={session.chat.id}
            title={session.chat.title}
            subtitle={`${session.provider.state} · ${session.cwd}`}
            value={session.online ? '' : 'Offline'}
            href={href.assistantChat(session.chat.id)}
          />
        ))}
      </List>
      {sessions.data?.length === 0 ? (
        <Text tone="variant">No owned CLI sessions in this view.</Text>
      ) : null}
    </>
  );
}

function LegacySessions({
  deviceId,
  archived,
  enabled,
}: {
  readonly deviceId: string;
  readonly archived: boolean;
  readonly enabled: boolean;
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
          void sessions.refetch();
        }}
      />
      <LegacyRows sessions={sessions.data} choose={choose} />
      <LegacyNativeUsage deviceId={deviceId} usage={native.data?.usage} />
      {enabled ? null : (
        <Text tone="variant">
          Connect this computer and enable legacy native access to read its saved transcripts.
        </Text>
      )}
      <Sheet
        open={chosen !== null}
        title={chosen?.title ?? 'Legacy native history'}
        onClose={() => {
          choose(null);
        }}
        detents={['full']}
      >
        {chosen === null ? null : (
          <NativeSession key={chosen.id} deviceId={deviceId} session={chosen} />
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
      {enabled ? null : <Text tone="variant">{startReason(status, owner)}</Text>}
      <ManagedSessions deviceId={deviceId} archived={archived} owner={owner} />
      <LegacySessions
        deviceId={deviceId}
        archived={archived}
        enabled={legacyEnabled(status, owner)}
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
          void status.refetch();
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
  return (
    <List
      title="Legacy native history"
      footer="Original Desktop and terminal records stay read-only; they do not confer CLI ownership."
    >
      {(sessions ?? []).map((session) => (
        <NavRow
          key={session.id}
          title={session.title ?? 'Untitled native session'}
          subtitle={`${session.state} · ${session.cwd ?? 'Folder unavailable'}`}
          onPress={() => {
            choose(session);
          }}
        />
      ))}
    </List>
  );
}

function canStart(status: ComputerAiStatus | undefined, owner: boolean): boolean {
  return (
    owner &&
    status?.online === true &&
    status.settings.provider.enabled &&
    status.capabilities.provider_reason === null
  );
}
function startReason(status: ComputerAiStatus | undefined, owner: boolean): string {
  if (!owner) return 'Native CLI access requires the hub owner.';
  if (status?.online === false)
    return 'This computer is offline. Saved owned chats remain readable.';
  return (
    status?.capabilities.provider_reason ??
    'Enable the native Claude provider to start a CLI session. Saved owned chats remain readable.'
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
      provider="Claude legacy history"
      computer={device?.label ?? 'Computer unavailable'}
      windows={claudeSubscriptionWindows(usage)}
    />
  );
}

function legacyEnabled(status: ComputerAiStatus | undefined, owner: boolean): boolean {
  return owner && status?.online === true && status.settings.control.enabled;
}
