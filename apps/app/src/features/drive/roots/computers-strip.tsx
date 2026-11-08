import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveConflict, DriveSyncClient } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { STATUS_FILL, type StatusTone } from '../../../components/tone';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { computerGlyph } from '../../computers/data/computer-device';
import { flattenPages, useDriveConflicts, useDriveSyncClients } from '../../nas/data';

export type ComputerSyncState = 'upToDate' | 'syncing' | 'conflict' | 'failed' | 'offline';

export interface KnownComputer {
  readonly deviceId: string;
  readonly name: string;
  readonly online: boolean;
  readonly glyph: IconName;
}

export interface ComputerSyncRow {
  readonly deviceId: string;
  readonly name: string;
  readonly glyph: IconName;
  readonly state: ComputerSyncState;
  readonly tone: StatusTone | null;
  readonly sentence: string;
}

const UNKNOWN_COMPUTER = 'Unknown computer';

const STATE_TONE: Readonly<Record<ComputerSyncState, StatusTone | null>> = {
  upToDate: 'positive',
  syncing: 'info',
  conflict: 'warning',
  failed: 'critical',
  offline: null,
};

function stateOf(
  online: boolean,
  clients: readonly DriveSyncClient[],
  conflicts: number,
): ComputerSyncState {
  if (!online) return 'offline';
  if (clients.some((client) => client.errors.length > 0)) return 'failed';
  if (conflicts > 0) return 'conflict';
  return clients.some((client) => client.needBytes > 0) ? 'syncing' : 'upToDate';
}

function sentenceOf(state: ComputerSyncState, need: number, conflicts: number): string {
  switch (state) {
    case 'failed':
      return 'Sync failed';
    case 'conflict':
      return plural(conflicts, 'conflict');
    case 'syncing':
      return `Syncing · ${bytes(need)} left`;
    case 'offline':
      return need > 0 ? `Offline · ${bytes(need)} waiting` : 'Offline';
    case 'upToDate':
      return 'Up to date';
  }
}

function rowOf(
  deviceId: string,
  clients: readonly DriveSyncClient[],
  conflicts: number,
  computer: KnownComputer | undefined,
): ComputerSyncRow {
  const need = clients.reduce((all, client) => all + client.needBytes, 0);
  const state = stateOf(computer?.online ?? false, clients, conflicts);
  return {
    deviceId,
    name: computer?.name ?? UNKNOWN_COMPUTER,
    glyph: computer?.glyph ?? 'monitor',
    state,
    tone: STATE_TONE[state],
    sentence: sentenceOf(state, need, conflicts),
  };
}

export function computerRowsOf(
  clients: readonly DriveSyncClient[],
  conflicts: readonly DriveConflict[],
  computers: ReadonlyMap<string, KnownComputer>,
): readonly ComputerSyncRow[] {
  const enabled = clients.filter((client) => client.enabled);
  const open = conflicts.filter((conflict) => conflict.resolvedAt === null);
  return [...new Set(enabled.map((client) => client.deviceId))].map((deviceId) =>
    rowOf(
      deviceId,
      enabled.filter((client) => client.deviceId === deviceId),
      open.filter((conflict) => conflict.deviceId === deviceId).length,
      computers.get(deviceId),
    ),
  );
}

export function computersLineOf(rows: readonly ComputerSyncRow[]): string {
  const online = rows.filter((row) => row.state !== 'offline').length;
  return `${plural(rows.length, 'computer')} · ${String(online)} online`;
}

function computersIn(state: StoreState, deviceIds: readonly string[]): readonly KnownComputer[] {
  return deviceIds.flatMap((deviceId) => {
    const device = state.tables.devices.byId[deviceId];
    return device === undefined
      ? []
      : [{ deviceId, name: device.label, online: device.online, glyph: computerGlyph(device) }];
  });
}

function useComputerRows(): readonly ComputerSyncRow[] {
  const clients = useDriveSyncClients();
  const conflicts = flattenPages(useDriveConflicts(null).data, (page) => page.items);
  const deviceIds = [...new Set(clients.map((client) => client.deviceId))];
  const computers = useStoreSelector((state) => computersIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  return computerRowsOf(
    clients,
    conflicts,
    new Map(computers.map((computer) => [computer.deviceId, computer])),
  );
}

function StateDot({ tone }: { readonly tone: StatusTone | null }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-2 rounded-full',
        tone === null ? 'bg-on-surface-faint' : STATUS_FILL[tone],
      )}
    />
  );
}

function ComputerItem({ row }: { readonly row: ComputerSyncRow }): ReactNode {
  return (
    <Interactive
      href={href.drivePage('computers')}
      label={`${row.name}, ${row.sentence}`}
      className="min-h-touch-min min-w-48 flex-1 flex-row items-center gap-3 rounded-sm"
      layerClassName="rounded-sm"
    >
      <IconWell icon={row.glyph} colour="viz-blue" size="m" />
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {row.name}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <StateDot tone={row.tone} />
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink tabular">
            {row.sentence}
          </Text>
        </View>
      </View>
    </Interactive>
  );
}

export function ComputersStrip(): ReactNode {
  const rows = useComputerRows();
  return (
    <Card
      title="Computers"
      icon="monitor"
      action={<Button label="Open Sync" variant="text" href={href.drivePage('sync')} />}
    >
      {rows.length === 0 ? (
        <Text variant="callout" tone="variant">
          No computer syncs your Drive yet. Make a folder synced from Sync.
        </Text>
      ) : (
        <View className="gap-2">
          <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
            {computersLineOf(rows)}
          </Text>
          <View className="flex-row flex-wrap gap-x-6 gap-y-1">
            {rows.map((row) => (
              <ComputerItem key={row.deviceId} row={row} />
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}
