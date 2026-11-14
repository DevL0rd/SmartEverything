import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { WideCard, WideFigure, type WideClass, type WideFrame } from '../../../features/devices';
import { decimal } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { CellGate, type CellCopy } from '../../shared/cell-gate';
import { CellGraphSlot } from '../../shared/cell-graph';
import { LiveCell } from '../../shared/cell-live';
import {
  CellAction,
  CellBadge,
  CellLine,
  CellPluginAction,
  FitLine,
  LegendDot,
  LegendSwatch,
} from '../../shared/cell-parts';
import { cellMedallionSize } from '../../shared/medallion-model';
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
    <FitLine
      items={folders.map((folder) => ({
        key: folder.id,
        node: (
          <>
            <FolderRing state={folder.state} size={RING_PX} label={folder.label} />
            <Text variant="caption" numberOfLines={1} className="shrink">
              {folder.state.glyph === null
                ? `${folder.label} ${decimal(folder.state.percent)} %`
                : folder.label}
            </Text>
          </>
        ),
      }))}
    />
  );
}

function Peers({ peers }: { readonly peers: readonly CellPeer[] }): ReactNode {
  return (
    <FitLine
      items={peers.map((peer) => ({
        key: peer.id,
        node: (
          <>
            <LegendSwatch swatch={peer.online ? 'bg-positive' : 'bg-outline'} />
            <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
              {peer.name}
            </Text>
          </>
        ),
      }))}
    />
  );
}

function figuresOf(cell: SyncCell): readonly ReactNode[] {
  const lead =
    cell.rates.length > 0
      ? cell.rates.map((rate) => (
          <WideFigure
            key={rate.caption}
            value={rate.value}
            unit={rate.unit}
            caption={rate.caption}
          />
        ))
      : [<FolderRings key="rings" folders={cell.folders} />];
  return cell.peers.length === 0 ? lead : [...lead, <Peers key="peers" peers={cell.peers} />];
}

function useCellActions(
  device: Device,
  cls: WideClass,
  cell: SyncCell,
  owner: boolean,
): readonly ReactNode[] {
  const actions = useSyncCellActions();
  if (!owner || !cell.canAct) {
    return [];
  }
  const primary = (
    <CellPluginAction
      key="pause"
      cls={cls}
      label={cell.paused ? 'Resume' : 'Pause'}
      variant={cell.paused ? 'filled' : 'tonal'}
      icon={cell.paused ? 'play' : 'pause'}
      onPress={() => actions.pauseAll(!cell.paused)}
    />
  );
  const secondary =
    cell.problem === null ? (
      <CellPluginAction
        key="rescan"
        cls={cls}
        label="Rescan"
        variant="text"
        icon="refresh"
        onPress={actions.rescanAll}
      />
    ) : (
      <CellAction
        key="conflict"
        cls={cls}
        label="Show conflict"
        variant="filled"
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
  readonly owner: boolean;
  readonly frame: WideFrame;
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
      size={cellMedallionSize(cls)}
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
  const head = (
    <View className="flex-row items-center gap-3" aria-hidden>
      <LegendDot swatch="bg-viz-1" label="In" />
      <LegendDot swatch="bg-viz-2" label="Out" />
      <Text variant="caption" tone="faint" className="ml-auto">
        {live ? 'Last 2 min' : 'Last 24 h'}
      </Text>
    </View>
  );
  return (
    <CellGraphSlot cap={GRAPH_HEIGHT[cls]} head={head}>
      {(height) => <SyncGraph device={device} live={showLive} height={height} faint={stale} />}
    </CellGraphSlot>
  );
}

function StateLine({ cell }: { readonly cell: SyncCell }): ReactNode {
  return cell.line === null ? null : (
    <CellLine text={cell.line} tone={cell.kind === 'error' ? 'critical' : 'variant'} />
  );
}

function CellBody({ device, cls, snapshot, live, owner, frame }: BodyProps): ReactNode {
  const now = useMinute();
  const activity = useSyncActivity();
  const cell = syncCellOf(snapshot, now);
  const actions = useCellActions(device, cls, cell, owner);
  const file = activity.state === 'ready' ? lastFileLine(activity.value, now) : null;
  return (
    <WideCard
      frame={frame}
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={<Medallion cell={cell} cls={cls} live={live} />}
      chip={<CellBadge chip={cell.chip} />}
      state={<StateLine cell={cell} />}
      figures={figuresOf(cell)}
      graph={<GraphBlock device={device} cls={cls} cell={cell} live={live} />}
      actions={actions}
      ticker={file === null || cell.kind === 'stale' ? undefined : <CellLine text={file} />}
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
      {(snapshot, owner) => (
        <LiveCell>
          {(live, frame) => (
            <>
              {live ? <SyncHold device={device} snapshot={snapshot} /> : null}
              <CellBody
                device={device}
                cls={cls}
                snapshot={snapshot}
                live={live}
                owner={owner}
                frame={frame}
              />
            </>
          )}
        </LiveCell>
      )}
    </CellGate>
  );
}
