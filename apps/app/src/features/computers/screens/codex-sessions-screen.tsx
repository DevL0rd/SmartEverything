import type { z } from 'zod';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerRuntimeStatus, CODEX_SESSION_PAGE } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useIsOwner, useDevice } from '../../../store/selectors';
import { SubscriptionUsageBars } from '../../assistant/provider/subscription-usage';
import { codexSubscriptionWindows } from '../../assistant/provider/subscription-usage-values';
import { ComputerFrame } from '../components/computer-frame';
import { QueryState } from '../components/query-state';
import { CodexNativeStart } from '../components/codex-native-start';
import { CodexNativeSession } from '../components/codex-native-session';
import { useComputerRuntime, useRuntimeSupported, useCodexRead } from '../data/computer-runtime';
function Sessions({
  status,
  enabled,
}: {
  readonly status: ComputerRuntimeStatus;
  readonly enabled: boolean;
}): ReactNode {
  const [archived, setArchived] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selected, select] = useState<string | null>(null);
  const [creating, create] = useState(false);
  const sessions = useCodexRead(
    status.device_id,
    {
      operation: 'sessions',
      query: { archived, limit: 50, ...(cursor === undefined ? {} : { cursor }) },
    },
    enabled,
  );

  const page = sessions.data?.operation === 'sessions' ? sessions.data.value : null;
  return (
    <View className="gap-section-gap">
      <NativeUsage status={status} enabled={enabled} />
      <SessionsControls
        archived={archived}
        setArchived={setArchived}
        setCursor={setCursor}
        status={status}
        enabled={enabled}
        create={create}
      />
      <SessionsQuery sessions={sessions} enabled={enabled} />
      <SessionRows
        page={page}
        enabled={enabled}
        select={select}
        cursor={cursor}
        setCursor={setCursor}
      />
      <SessionSheets
        status={status}
        enabled={enabled}
        creating={creating}
        create={create}
        selected={selected}
        select={select}
      />
    </View>
  );
}
export function ComputerCodexSessionsScreen({
  deviceId,
}: {
  readonly deviceId: string;
}): ReactNode {
  const owner = useIsOwner();
  const supported = useRuntimeSupported();
  const status = useComputerRuntime(deviceId);
  const enabled = controlEnabled(status.data);
  return (
    <ComputerFrame deviceId={deviceId} title="Codex sessions">
      {!owner || !supported ? (
        <Text tone="variant">
          {!owner
            ? 'Native Codex sessions require the hub owner.'
            : 'Update the hub to access Codex sessions.'}
        </Text>
      ) : (
        <>
          <QueryState
            error={status.error}
            pending={status.isPending}
            retry={() => {
              void status.refetch();
            }}
          />
          {enabled ? null : (
            <Text tone="variant">
              {status.data?.capabilities.control_reason ??
                'Enable native control on a connected computer.'}
            </Text>
          )}
          {status.data === undefined ? null : <Sessions status={status.data} enabled={enabled} />}
        </>
      )}
    </ComputerFrame>
  );
}

function SessionSheets({
  status,
  enabled,
  creating,
  create,
  selected,
  select,
}: {
  readonly status: ComputerRuntimeStatus;
  readonly enabled: boolean;
  readonly creating: boolean;
  readonly create: (value: boolean) => void;
  readonly selected: string | null;
  readonly select: (value: string | null) => void;
}): ReactNode {
  return (
    <>
      <Sheet
        title="New native Codex session"
        open={creating}
        onClose={() => {
          create(false);
        }}
        detents={['full']}
      >
        {creating && enabled ? <CodexNativeStart status={status} /> : null}
      </Sheet>
      <Sheet
        title="Native Codex session"
        open={selected !== null}
        onClose={() => {
          select(null);
        }}
        detents={['full']}
      >
        {selected !== null && enabled ? (
          <CodexNativeSession
            key={selected}
            deviceId={status.device_id}
            sessionId={selected}
            capabilities={status.capabilities}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function SessionRows({
  page,
  enabled,
  select,
  cursor,
  setCursor,
}: {
  readonly page: z.output<typeof CODEX_SESSION_PAGE> | null;
  readonly enabled: boolean;
  readonly select: (value: string) => void;
  readonly cursor: string | undefined;
  readonly setCursor: (value: string | undefined) => void;
}): ReactNode {
  return (
    <>
      <List title="Actual native sessions">
        {(page?.sessions ?? []).map((session) => (
          <NavRow
            key={session.id}
            title={session.title ?? 'Untitled native session'}
            subtitle={`${session.state} · ${session.cwd ?? 'Folder unavailable'}`}
            disabled={!enabled}
            onPress={() => {
              select(session.id);
            }}
          />
        ))}
      </List>
      {page?.sessions.length === 0 ? (
        <Text tone="variant">No native sessions in this view.</Text>
      ) : null}
      {page?.next_cursor === null || page === null ? null : (
        <Button
          label="Next sessions page"
          variant="tonal"
          onPress={() => {
            setCursor(page.next_cursor ?? undefined);
          }}
        />
      )}
      <LatestSessions cursor={cursor} setCursor={setCursor} />
    </>
  );
}

function controlEnabled(status: ComputerRuntimeStatus | undefined): boolean {
  return (
    status?.settings.runtime === 'codex' &&
    status.online &&
    status.settings.settings.control.enabled
  );
}

function SessionsControls({
  archived,
  setArchived,
  setCursor,
  status,
  enabled,
  create,
}: {
  readonly archived: boolean;
  readonly setArchived: (value: boolean) => void;
  readonly setCursor: (value: string | undefined) => void;
  readonly status: ComputerRuntimeStatus;
  readonly enabled: boolean;
  readonly create: (value: boolean) => void;
}): ReactNode {
  return (
    <>
      <SwitchRow
        title="Archived native sessions"
        value={archived}
        onChange={(value) => {
          setArchived(value);
          setCursor(undefined);
        }}
      />
      <Button
        label="New native Codex session"
        disabled={!enabled || !status.capabilities.operations.includes('start')}
        onPress={() => {
          create(true);
        }}
      />
    </>
  );
}

function LatestSessions({
  cursor,
  setCursor,
}: {
  readonly cursor: string | undefined;
  readonly setCursor: (value: string | undefined) => void;
}): ReactNode {
  return cursor === undefined ? null : (
    <Button
      label="Latest sessions"
      variant="text"
      onPress={() => {
        setCursor(undefined);
      }}
    />
  );
}

function NativeUsage({
  status,
  enabled,
}: {
  readonly status: ComputerRuntimeStatus;
  readonly enabled: boolean;
}): ReactNode {
  const usage = useCodexRead(status.device_id, { operation: 'usage' }, enabled);
  const device = useDevice(status.device_id);
  return (
    <SubscriptionUsageBars
      provider="Codex"
      computer={device?.label ?? 'Computer unavailable'}
      windows={codexSubscriptionWindows(
        usage.data?.operation === 'usage' ? usage.data.value.rate_limits : null,
      )}
    />
  );
}

function SessionsQuery({
  sessions,
  enabled,
}: {
  readonly sessions: ReturnType<typeof useCodexRead>;
  readonly enabled: boolean;
}): ReactNode {
  return (
    <QueryState
      error={sessions.error}
      pending={sessions.isPending ? enabled : false}
      retry={() => {
        void sessions.refetch();
      }}
    />
  );
}
