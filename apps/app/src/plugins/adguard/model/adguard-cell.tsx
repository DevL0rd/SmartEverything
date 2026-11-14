import type { AdGuardSnapshot, AdGuardTopEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { WideCard, WideFigure, type WideClass, type WideFrame } from '../../../features/devices';
import { count } from '../../../format/number';
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
  LegendDot,
  useListRoom,
} from '../../shared/cell-parts';
import { cellMedallionSize } from '../../shared/medallion-model';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ADGUARD_PLUGIN, useAdGuardSnapshot } from '../adguard-data';
import { pauseMenuItems, useAdGuardActions, type AdGuardActions } from '../quick-actions';
import { adguardCellOf, type AdGuardCell } from './adguard-cell-model';
import { AdGuardGraph, AdGuardHold, LiveBlockedFigure } from './adguard-graph';
import { adguardSectionHref } from './links';

const GRAPH_HEIGHT: Readonly<Record<WideClass, number>> = { m: 40, w: 44, l: 96, xl: 96 };

function PauseMenu({
  cls,
  actions,
}: {
  readonly cls: WideClass;
  readonly actions: AdGuardActions;
}): ReactNode {
  const items = pauseMenuItems(actions.pauseFor, (work) => {
    background(work, 'adguard_cell.pause_failed');
  });
  const { ref, open, menu } = useAnchoredMenu(items, 'Pause ad blocking');
  return (
    <View ref={ref} collapsable={false}>
      <CellAction cls={cls} label="Pause" variant="tonal" icon="pause" onPress={open} />
      {menu}
    </View>
  );
}

function TopRows({
  rows,
  caption,
}: {
  readonly rows: readonly AdGuardTopEntry[];
  readonly caption: string;
}): ReactNode {
  const room = useListRoom();
  const shown = room.rows === null ? rows : rows.slice(0, room.rows);
  return rows.length === 0 ? null : (
    <View
      onLayout={room.onLayout}
      className="min-h-0 min-w-0 flex-1 gap-0.5 overflow-hidden"
      aria-hidden
    >
      {shown.length === 0 ? null : (
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {caption}
        </Text>
      )}
      {shown.map((row) => (
        <View key={row.name} className="flex-row items-center gap-2">
          <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
            {row.name}
          </Text>
          <Text variant="caption" className="tabular">
            {count(row.count)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ProtectionAction({
  cls,
  cell,
  actions,
}: {
  readonly cls: WideClass;
  readonly cell: AdGuardCell;
  readonly actions: AdGuardActions;
}): ReactNode {
  if (cell.kind === 'on') {
    return <PauseMenu cls={cls} actions={actions} />;
  }
  return (
    <CellPluginAction
      cls={cls}
      label={cell.kind === 'paused' ? 'Resume' : 'Turn on'}
      variant="filled"
      icon={cell.kind === 'paused' ? 'play' : 'shield'}
      onPress={actions.resume}
    />
  );
}

function useCellActions(
  device: Device,
  cls: WideClass,
  cell: AdGuardCell,
  owner: boolean,
): readonly ReactNode[] {
  const actions = useAdGuardActions();
  if (cell.kind === 'stale') {
    return [];
  }
  const log = (
    <CellAction
      key="log"
      cls={cls}
      label="Query log"
      variant="text"
      icon="list"
      href={adguardSectionHref(device.id, 'queries')}
    />
  );
  return owner
    ? [log, <ProtectionAction key="protection" cls={cls} cell={cell} actions={actions} />]
    : [log];
}

interface BodyProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly snapshot: AdGuardSnapshot;
  readonly live: boolean;
  readonly owner: boolean;
  readonly frame: WideFrame;
}

function figuresOf(cell: AdGuardCell, device: Device, live: boolean): readonly ReactNode[] {
  const base = cell.figures.map((figure) => (
    <WideFigure
      key={figure.caption}
      value={figure.value}
      unit={figure.unit}
      caption={figure.caption}
      stale={cell.kind === 'stale'}
    />
  ));
  return live && cell.kind === 'on'
    ? [...base, <LiveBlockedFigure key="rate" device={device} />]
    : base;
}

function Extras({ cell }: { readonly cell: AdGuardCell }): ReactNode {
  return (
    <View className="min-h-0 flex-1 gap-3">
      <View className="min-h-0 flex-1 flex-row gap-6">
        <TopRows rows={cell.topBlocked} caption="Top blocked" />
        <TopRows rows={cell.topClients} caption="Top clients" />
      </View>
      {cell.lists === null ? null : <CellLine text={cell.lists} />}
    </View>
  );
}

function GraphHead({ live }: { readonly live: boolean }): ReactNode {
  return (
    <View className="flex-row items-center gap-3" aria-hidden>
      <LegendDot swatch="bg-viz-1" label="Allowed" />
      <LegendDot swatch="bg-viz-3" label="Blocked" />
      <Text variant="caption" tone="faint" className="ml-auto">
        {live ? 'Live' : 'Last 24 h'}
      </Text>
    </View>
  );
}

function graphOf(cls: WideClass, device: Device, live: boolean, cell: AdGuardCell): ReactNode {
  const showLive = live && cell.kind !== 'stale';
  const slot = (
    <CellGraphSlot cap={GRAPH_HEIGHT[cls]} head={<GraphHead live={live} />}>
      {(height) => (
        <AdGuardGraph device={device} live={showLive} height={height} bars={cell.bars} />
      )}
    </CellGraphSlot>
  );
  if (cls !== 'w') {
    return slot;
  }
  return (
    <View className="min-h-0 flex-1 gap-1.5">
      <TopRows rows={cell.topBlocked} caption="Top blocked" />
      {slot}
    </View>
  );
}

const LINE_TONE: Readonly<Record<Exclude<AdGuardCell['kind'], 'stale'>, Tone>> = {
  on: 'variant',
  paused: 'warning',
  off: 'critical',
};

function Medallion({
  cell,
  cls,
  live,
}: {
  readonly cell: AdGuardCell;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  const pulse = live && cell.kind === 'on';
  return (
    <ServiceMedallion
      glyph="shield"
      tone={cell.tone}
      ratio={cell.ratio}
      live={pulse}
      size={cellMedallionSize(cls)}
      label={cell.spoken}
      offline={cell.kind === 'stale'}
    />
  );
}

function tickerOf(cls: WideClass, cell: AdGuardCell): ReactNode {
  const top = cell.topBlocked[0];
  return cls === 'm' && cell.kind === 'on' && top !== undefined ? (
    <CellLine text={`${top.name} · ${count(top.count)}`} />
  ) : undefined;
}

function StateLine({ cell }: { readonly cell: AdGuardCell }): ReactNode {
  return cell.kind === 'stale' || cell.line === null ? null : (
    <CellLine text={cell.line} tone={LINE_TONE[cell.kind]} />
  );
}

function CellBody({ device, cls, snapshot, live, owner, frame }: BodyProps): ReactNode {
  const now = useMinute();
  const cell = adguardCellOf(snapshot, now);
  const actions = useCellActions(device, cls, cell, owner);
  return (
    <WideCard
      frame={frame}
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={<Medallion cell={cell} cls={cls} live={live} />}
      chip={<CellBadge chip={cell.chip} />}
      state={<StateLine cell={cell} />}
      figures={figuresOf(cell, device, live)}
      graph={graphOf(cls, device, live, cell)}
      actions={actions}
      ticker={tickerOf(cls, cell)}
      log={cell.kind === 'stale' ? undefined : <Extras cell={cell} />}
    />
  );
}

const COPY: CellCopy = {
  subject: 'AdGuard Home',
  off: 'The AdGuard Home plugin is off',
  waiting: 'Waiting for AdGuard Home',
  notSetUp: 'Connect it to block ads',
};

export function AdGuardCellFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const stream = useAdGuardSnapshot();
  return (
    <CellGate
      device={device}
      cls={cls}
      pluginId={ADGUARD_PLUGIN}
      glyph="shield"
      copy={COPY}
      stream={stream}
    >
      {(snapshot, owner) => (
        <LiveCell>
          {(live, frame) => (
            <>
              {live ? <AdGuardHold device={device} snapshot={snapshot} /> : null}
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
