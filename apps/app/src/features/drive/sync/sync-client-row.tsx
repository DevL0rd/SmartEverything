import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveConflict, DriveRoot, DriveSyncClient } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Arc, Sparkline } from '../../../components/charts';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { plural } from '../../../format/text';
import type { SyncComputer } from '../roots/root-card-model';
import {
  SYNC_STATE_LOOK,
  clientStatusOf,
  clientViewOf,
  lastHourOf,
  needOf,
  worstStatusOf,
  type SyncChange,
  type SyncClientStatus,
  type SyncClientView,
} from './sync-model';

export const UNKNOWN_COMPUTER = 'Unknown computer';

export interface SyncFacts {
  readonly clients: readonly DriveSyncClient[];
  readonly conflicts: readonly DriveConflict[];
  readonly moreConflicts: boolean;
  readonly computers: ReadonlyMap<string, SyncComputer>;
  readonly changes: readonly SyncChange[];
  readonly now: number;
}

function statusIn(client: DriveSyncClient, facts: SyncFacts): SyncClientStatus {
  return clientStatusOf({
    client,
    online: facts.computers.get(client.deviceId)?.online ?? false,
    conflicts: facts.conflicts.filter(
      (conflict) => conflict.rootId === client.rootId && conflict.deviceId === client.deviceId,
    ),
    moreConflicts: facts.moreConflicts,
  });
}

export function folderClientViewsOf(root: DriveRoot, facts: SyncFacts): readonly SyncClientView[] {
  const changes = facts.changes.filter((change) => change.rootId === root.id);
  return facts.clients
    .filter((client) => client.rootId === root.id)
    .map((client) => {
      const computer = facts.computers.get(client.deviceId);
      return clientViewOf({
        key: `${client.clientId}\n${client.rootId}`,
        name: computer?.name ?? UNKNOWN_COMPUTER,
        status: statusIn(client, facts),
        rootBytes: root.bytes,
        lastSeenAt: client.lastSeenAt,
        online: computer?.online ?? false,
        selected: client.selected,
        extra: null,
        hour: lastHourOf(changes, facts.now, client.deviceId),
        now: facts.now,
      });
    });
}

function withNeed(status: SyncClientStatus, need: number): SyncClientStatus {
  return 'needBytes' in status ? { ...status, needBytes: need } : status;
}

export function latestSeenOf(clients: readonly DriveSyncClient[]): string | null {
  return clients.reduce<string | null>(
    (seen, client) =>
      client.lastSeenAt !== null &&
      (seen === null || Date.parse(client.lastSeenAt) > Date.parse(seen))
        ? client.lastSeenAt
        : seen,
    null,
  );
}

function computerViewOf(
  deviceId: string,
  clients: readonly DriveSyncClient[],
  bytesOf: (rootId: string) => number,
  facts: SyncFacts,
): SyncClientView {
  const statuses = clients.map((client) => statusIn(client, facts));
  const need = statuses.reduce((all, status) => all + needOf(status), 0);
  const computer = facts.computers.get(deviceId);
  return clientViewOf({
    key: deviceId,
    name: computer?.name ?? UNKNOWN_COMPUTER,
    status: withNeed(worstStatusOf(statuses), need),
    rootBytes: clients.reduce((all, client) => all + bytesOf(client.rootId), 0),
    lastSeenAt: latestSeenOf(clients),
    online: computer?.online ?? false,
    selected: [],
    extra: `syncs ${plural(clients.length, 'folder')}`,
    hour: lastHourOf(facts.changes, facts.now, deviceId),
    now: facts.now,
  });
}

export function computerViewsOf(
  roots: readonly DriveRoot[],
  facts: SyncFacts,
): readonly SyncClientView[] {
  const sizes = new Map(roots.map((root) => [root.id, root.bytes]));
  const ids = [...new Set(facts.clients.map((client) => client.deviceId))];
  return ids.map((deviceId) =>
    computerViewOf(
      deviceId,
      facts.clients.filter((client) => client.deviceId === deviceId),
      (rootId) => sizes.get(rootId) ?? 0,
      facts,
    ),
  );
}

const RING_THICKNESS = 3;

function Ring({ view }: { readonly view: SyncClientView }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const size = pointer ? 32 : 40;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${view.name}, ${String(Math.round(view.ring * 100))} percent synced`}
      className="shrink-0 items-center justify-center"
    >
      <Arc
        value={view.ring}
        size={size}
        thickness={RING_THICKNESS}
        colour={SYNC_STATE_LOOK[view.status.state].ring}
        trackColour="surface-3"
      />
    </View>
  );
}

function Throughput({ view }: { readonly view: SyncClientView }): ReactNode {
  if (view.rate === null) return null;
  return (
    <View className="flex-none flex-row items-center gap-2">
      <View className="w-11">
        <Sparkline points={view.series} colour="info" height={24} />
      </View>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {view.rate}
      </Text>
    </View>
  );
}

export function SyncClientRow({ view }: { readonly view: SyncClientView }): ReactNode {
  const tone = SYNC_STATE_LOOK[view.status.state].sentence;
  return (
    <ListRow
      title={view.name}
      subtitle={view.sentence}
      subtitleTone={tone}
      caption={view.details}
      label={view.spoken}
      leading={<Ring view={view} />}
      trailing={<Throughput view={view} />}
    />
  );
}

const STAR_NOTE =
  'The hub keeps the master copy. Each computer syncs with the hub, so a folder stays in sync even when two computers are never online together.';

export function ComputersCard({
  facts,
  roots,
}: {
  readonly facts: SyncFacts;
  readonly roots: readonly DriveRoot[];
}): ReactNode {
  const views = computerViewsOf(roots, facts);
  if (views.length === 0) return null;
  return (
    <Card title="Computers" icon="monitor" padding="none" className="gap-0">
      {views.map((view) => (
        <SyncClientRow key={view.key} view={view} />
      ))}
      <View className="px-card-pad pb-card-pad">
        <Text variant="footnote" tone="variant">
          {STAR_NOTE}
        </Text>
      </View>
    </Card>
  );
}
