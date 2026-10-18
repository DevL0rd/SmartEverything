import type { AdGuardSnapshot, AdGuardTopEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { WideCard, WideFigure, type WideClass } from '../../../features/devices';
import { count } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CellGate, type CellCopy } from '../../shared/cell-gate';
import { LiveCell } from '../../shared/cell-live';
import { CellBadge, CellLine, CellWhy, LegendDot } from '../../shared/cell-parts';
import { PluginButton } from '../../shared/plugin-action';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ADGUARD_PLUGIN, useAdGuardSnapshot } from '../adguard-data';
import { pauseMenuItems, useAdGuardActions, type AdGuardActions } from '../quick-actions';
import { adguardCellOf, type AdGuardCell } from './adguard-cell-model';
import { AdGuardGraph, AdGuardHold, LiveBlockedFigure } from './adguard-graph';
import { adguardSectionHref } from './links';

const GRAPH_HEIGHT: Readonly<Record<WideClass, number>> = { m: 40, w: 44, l: 96, xl: 96 };

function PauseMenu({ actions }: { readonly actions: AdGuardActions }): ReactNode {
  const items = pauseMenuItems(actions.pauseFor, (work) => {
    background(work, 'adguard_cell.pause_failed');
  });
  const { ref, open, menu } = useAnchoredMenu(items, 'Pause ad blocking');
  return (
    <View ref={ref} collapsable={false}>
      <Button label="Pause" variant="tonal" size="md" icon="pause" onPress={open} />
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
  return rows.length === 0 ? null : (
    <View className="min-w-0 gap-0.5" aria-hidden>
      <Text variant="caption" tone="faint">
        {caption}
      </Text>
      {rows.map((row) => (
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

function useCellActions(cell: AdGuardCell, owner: boolean): readonly ReactNode[] {
  const actions = useAdGuardActions();
  if (cell.kind === 'stale') {
    return [<CellWhy key="why" text={cell.reason ?? cell.line} critical />];
  }
  if (!owner) {
    return [];
  }
  if (cell.kind !== 'on') {
    return [
      <PluginButton
        key="resume"
        label={cell.kind === 'paused' ? 'Resume' : 'Turn on'}
        variant="filled"
        size="md"
        icon={cell.kind === 'paused' ? 'play' : 'shield'}
        onPress={actions.resume}
      />,
    ];
  }
  return [<PauseMenu key="pause" actions={actions} />];
}

interface BodyProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly snapshot: AdGuardSnapshot;
  readonly live: boolean;
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

function Extras({
  cell,
  device,
}: {
  readonly cell: AdGuardCell;
  readonly device: Device;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="flex-row gap-6">
        <View className="min-w-0 flex-1">
          <TopRows rows={cell.topBlocked} caption="Top blocked" />
        </View>
        <View className="min-w-0 flex-1">
          <TopRows rows={cell.topClients} caption="Top clients" />
        </View>
      </View>
      {cell.lists === null ? null : <CellLine text={cell.lists} />}
      <Button
        label="Query log"
        variant="text"
        size="md"
        icon="list"
        href={adguardSectionHref(device.id, 'queries')}
      />
    </View>
  );
}

function graphOf(cls: WideClass, device: Device, live: boolean, cell: AdGuardCell): ReactNode {
  const showLive = live && cell.kind !== 'stale';
  const bars = (
    <AdGuardGraph device={device} live={showLive} height={GRAPH_HEIGHT[cls]} bars={cell.bars} />
  );
  if (cls === 'm') {
    return bars;
  }
  return (
    <View className="gap-1.5">
      {cls === 'w' ? <TopRows rows={cell.topBlocked} caption="Top blocked" /> : null}
      <View className="flex-row items-center gap-3" aria-hidden>
        <LegendDot swatch="bg-viz-1" label="Allowed" />
        <LegendDot swatch="bg-viz-3" label="Blocked" />
        <Text variant="caption" tone="faint" className="ml-auto">
          {live ? 'Live' : 'Last 24 h'}
        </Text>
      </View>
      {bars}
    </View>
  );
}

const LINE_TONE: Readonly<Record<AdGuardCell['kind'], Tone>> = {
  on: 'variant',
  paused: 'warning',
  off: 'critical',
  stale: 'variant',
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
      size={cls === 'm' ? 'cell' : 'hero'}
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

function CellBody({ device, cls, snapshot, live }: BodyProps): ReactNode {
  const owner = useIsOwner();
  const now = useMinute();
  const cell = adguardCellOf(snapshot, now);
  const actions = useCellActions(cell, owner);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={<Medallion cell={cell} cls={cls} live={live} />}
      chip={<CellBadge chip={cell.chip} />}
      state={<CellLine text={cell.line} tone={LINE_TONE[cell.kind]} />}
      figures={figuresOf(cell, device, live)}
      graph={graphOf(cls, device, live, cell)}
      actions={actions}
      ticker={tickerOf(cls, cell)}
      log={panel && cell.kind !== 'stale' ? <Extras cell={cell} device={device} /> : undefined}
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
      {(snapshot) => (
        <LiveCell>
          {(live) => (
            <>
              {live ? <AdGuardHold device={device} snapshot={snapshot} /> : null}
              <CellBody device={device} cls={cls} snapshot={snapshot} live={live} />
            </>
          )}
        </LiveCell>
      )}
    </CellGate>
  );
}
