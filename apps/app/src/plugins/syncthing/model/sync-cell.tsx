import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { WideCard, WideFigure, type WideClass } from '../../../features/devices';
import { decimal } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CellGate, type CellCopy } from '../../shared/cell-gate';
import { LiveCell } from '../../shared/cell-live';
import { CellBadge, CellLine, CellWhy, LegendDot } from '../../shared/cell-parts';
import { PluginButton } from '../../shared/plugin-action';
import { ServiceMedallion } from '../../shared/service-medallion';
import { useSyncCellActions } from '../quick-actions';
import { SYNCTHING_PLUGIN, useSyncActivity, useSyncthingSnapshot } from '../syncthing-data';
import { FolderRing } from './folder-ring';
import { syncSectionHref } from './links';
import {
  lastFileLine,
  syncCellOf,
  type CellFolder,
  type CellPeer,
  type SyncCell,
} from './sync-cell-model';
import { SyncGraph, SyncHold } from './sync-graph';

const GRAPH_HEIGHT: Readonly<Record<WideClass, number>> = { m: 36, w: 64, l: 96, xl: 96 };
const RING_PX = 20;

function FolderRings({ folders }: { readonly folders: readonly CellFolder[] }): ReactNode {
  return (
    <View className="flex-row items-center gap-3 overflow-hidden" aria-hidden>
      {folders.map((folder) => (
        <View key={folder.id} className="min-w-0 shrink flex-row items-center gap-1.5">
          <FolderRing state={folder.state} size={RING_PX} label={folder.label} />
          <Text variant="caption" numberOfLines={1} className="shrink">
            {folder.state.glyph === null
              ? `${folder.label} ${decimal(folder.state.percent)} %`
              : folder.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Peers({ peers }: { readonly peers: readonly CellPeer[] }): ReactNode {
  return peers.length === 0 ? null : (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1" aria-hidden>
      {peers.map((peer) => (
        <LegendDot
          key={peer.id}
          swatch={peer.online ? 'bg-positive' : 'bg-outline'}
          label={peer.name}
        />
      ))}
    </View>
  );
}

function figuresOf(cell: SyncCell, cls: WideClass): readonly ReactNode[] {
  if (cell.rates.length > 0) {
    return cell.rates.map((rate) => (
      <WideFigure key={rate.caption} value={rate.value} unit={rate.unit} caption={rate.caption} />
    ));
  }
  return [
    <FolderRings key="rings" folders={cell.folders} />,
    cls === 'm' ? null : <Peers key="peers" peers={cell.peers} />,
  ];
}

function useCellActions(device: Device, cell: SyncCell, owner: boolean): readonly ReactNode[] {
  const actions = useSyncCellActions();
  if (cell.kind === 'stale') {
    return [<CellWhy key="why" text={cell.reason ?? cell.line} critical />];
  }
  if (!owner || !cell.canAct) {
    return [];
  }
  const primary = (
    <PluginButton
      key="pause"
      label={cell.paused ? 'Resume' : 'Pause'}
      variant={cell.paused ? 'filled' : 'tonal'}
      size="md"
      icon={cell.paused ? 'play' : 'pause'}
      onPress={() => actions.pauseAll(!cell.paused)}
    />
  );
  const secondary =
    cell.problem === null ? (
      <PluginButton
        key="rescan"
        label="Rescan"
        variant="text"
        size="md"
        icon="refresh"
        onPress={actions.rescanAll}
      />
    ) : (
      <Button
        key="conflict"
        label="Show conflict"
        variant="filled"
        size="md"
        icon="warning"
        href={syncSectionHref(device.id, 'folders', { folder: cell.problem.id })}
      />
    );
  return [primary, secondary];
}

interface BodyProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly snapshot: SyncthingSnapshot;
  readonly live: boolean;
}

function Medallion({
  cell,
  cls,
  live,
}: {
  readonly cell: SyncCell;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  const pulse = live && cell.rates.length > 0;
  return (
    <ServiceMedallion
      glyph="folderSync"
      tone={cell.tone}
      ratio={cell.ratio}
      live={pulse}
      size={cls === 'm' ? 'cell' : 'hero'}
      label={cell.spoken}
      offline={cell.kind === 'stale'}
    />
  );
}

function GraphBlock({
  device,
  cls,
  cell,
  live,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly cell: SyncCell;
  readonly live: boolean;
}): ReactNode {
  const stale = cell.kind === 'stale';
  const showLive = live && !stale;
  return (
    <View className="gap-1">
      {cls === 'm' ? null : (
        <View className="flex-row items-center gap-3" aria-hidden>
          <LegendDot swatch="bg-viz-1" label="In" />
          <LegendDot swatch="bg-viz-2" label="Out" />
          <Text variant="caption" tone="faint" className="ml-auto">
            {live ? 'Last 2 min' : 'Last 24 h'}
          </Text>
        </View>
      )}
      <SyncGraph device={device} live={showLive} height={GRAPH_HEIGHT[cls]} faint={stale} />
    </View>
  );
}

function CellBody({ device, cls, snapshot, live }: BodyProps): ReactNode {
  const owner = useIsOwner();
  const now = useMinute();
  const activity = useSyncActivity();
  const cell = syncCellOf(snapshot, now);
  const actions = useCellActions(device, cell, owner);
  const file = activity.state === 'ready' ? lastFileLine(activity.value, now) : null;
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={<Medallion cell={cell} cls={cls} live={live} />}
      chip={<CellBadge chip={cell.chip} />}
      state={<CellLine text={cell.line} tone={cell.kind === 'error' ? 'critical' : 'variant'} />}
      figures={figuresOf(cell, cls)}
      graph={<GraphBlock device={device} cls={cls} cell={cell} live={live} />}
      actions={actions}
      ticker={file === null || cell.kind === 'stale' ? undefined : <CellLine text={file} />}
      log={panel ? <Peers peers={cell.peers} /> : undefined}
    />
  );
}

const COPY: CellCopy = {
  subject: 'Syncthing',
  off: 'The Syncthing plugin is off',
  waiting: 'Waiting for Syncthing',
  notSetUp: 'Connect it to sync',
};

export function SyncCellFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const stream = useSyncthingSnapshot();
  return (
    <CellGate
      device={device}
      cls={cls}
      pluginId={SYNCTHING_PLUGIN}
      glyph="folderSync"
      copy={COPY}
      stream={stream}
    >
      {(snapshot) => (
        <LiveCell>
          {(live) => (
            <>
              {live ? <SyncHold device={device} snapshot={snapshot} /> : null}
              <CellBody device={device} cls={cls} snapshot={snapshot} live={live} />
            </>
          )}
        </LiveCell>
      )}
    </CellGate>
  );
}
