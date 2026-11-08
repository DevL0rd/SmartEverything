import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gauge, type GaugeBand } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { WideCard, WideFigure, type WideClass } from '../../../features/devices';
import { CellGate, type CellCopy } from '../../shared/cell-gate';
import { CellGraphSlot } from '../../shared/cell-graph';
import { LiveCell } from '../../shared/cell-live';
import { CellBadge, CellLine, CellPluginAction, LegendDot } from '../../shared/cell-parts';
import { cellMedallionSize } from '../../shared/medallion-model';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ROUTER_PLUGIN, useRouterSnapshot, useSpeedTests, type SpeedTestRun } from '../router-data';
import { RESTART_WIFI } from '../router-confirmations';
import { useRouterActions } from '../quick-actions';
import { routerSectionHref } from './links';
import { routerCellOf, systemReadingsOf, type RouterCell } from './router-cell-model';
import { RouterGraph, RouterHold } from './router-graph';

const GRAPH_HEIGHT: Readonly<Record<WideClass, number>> = { m: 40, w: 84, l: 96, xl: 96 };
const GAUGE_PX = 48;
const GAUGE_WARN = 70;
const GAUGE_BANDS: readonly GaugeBand[] = [
  { upTo: GAUGE_WARN, colour: 'viz-1' },
  { upTo: 100, colour: 'warning' },
];

function Visual({
  cell,
  cls,
  live,
}: {
  readonly cell: RouterCell;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  const pulse = live && cell.kind === 'testing';
  return (
    <ServiceMedallion
      glyph="router"
      tone={cell.tone}
      ratio={cell.ratio}
      live={pulse}
      size={cellMedallionSize(cls)}
      label={cell.spoken}
      offline={cell.kind === 'stale'}
    />
  );
}

function figuresOf(cell: RouterCell): readonly ReactNode[] {
  return cell.figures.map((figure) => (
    <WideFigure
      key={figure.caption}
      value={figure.value}
      unit={figure.unit}
      caption={figure.caption}
      stale={cell.kind === 'stale'}
    />
  ));
}

function Gauges({ system }: { readonly system: NonNullable<RouterSnapshot['system']> }): ReactNode {
  return (
    <View className="flex-row items-center gap-5" aria-hidden>
      {systemReadingsOf(system).map((reading) => (
        <View key={reading.key} className="flex-row items-center gap-2">
          <Gauge
            value={reading.value}
            min={0}
            max={100}
            size={GAUGE_PX}
            label={`${reading.label} ${reading.text}`}
            bands={GAUGE_BANDS}
          />
          <View>
            <Text variant="caption" tone="variant">
              {reading.label}
            </Text>
            <Text variant="footnote" className="tabular">
              {reading.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function GraphHead({ live }: { readonly live: boolean }): ReactNode {
  return (
    <View className="flex-row items-center gap-3" aria-hidden>
      <LegendDot swatch="bg-viz-1" label="Download" />
      <LegendDot swatch="bg-viz-2" label="Upload" />
      <Text variant="caption" tone="faint" className="ml-auto">
        {live ? 'Last 2 min' : 'Last 24 h'}
      </Text>
    </View>
  );
}

interface ActionInput {
  readonly device: Device;
  readonly cls: WideClass;
  readonly cell: RouterCell;
  readonly owner: boolean;
}

function useCellActions({ device, cls, cell, owner }: ActionInput): readonly ReactNode[] {
  const actions = useRouterActions();
  if (cell.kind === 'stale') {
    return [];
  }
  const restart = owner ? (
    <CellPluginAction
      key="wifi"
      cls={cls}
      label="Restart Wi-Fi"
      variant={cell.kind === 'down' ? 'tonal' : 'text'}
      confirmation={RESTART_WIFI}
      onPress={actions.restartWifi}
    />
  ) : null;
  if (cell.kind === 'down') {
    return restart === null ? [] : [restart];
  }
  const test = (
    <CellPluginAction
      key="test"
      cls={cls}
      label={cell.kind === 'testing' ? 'Testing…' : 'Speed test'}
      variant="tonal"
      icon="gauge"
      loading={cell.kind === 'testing'}
      disabled={!cell.canRun}
      onPress={actions.speedTest}
    />
  );
  const people = (
    <IconButton
      key="home"
      icon="users"
      label="Who’s home"
      variant="standard"
      href={routerSectionHref(device.id, 'clients', { filter: 'people' })}
    />
  );
  return [test, people, restart];
}

function StateLine({ cell }: { readonly cell: RouterCell }): ReactNode {
  return cell.line === null ? null : (
    <CellLine text={cell.line} tone={cell.kind === 'down' ? 'critical' : 'variant'} />
  );
}

interface CellBodyProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly snapshot: RouterSnapshot;
  readonly run: SpeedTestRun;
  readonly last: SpeedTestResult | null;
  readonly live: boolean;
  readonly owner: boolean;
}

function CellBody({ device, cls, snapshot, run, last, live, owner }: CellBodyProps): ReactNode {
  const now = useMinute();
  const cell = routerCellOf(snapshot, run, last, now);
  const actions = useCellActions({ device, cls, cell, owner });
  const stale = cell.kind === 'stale';
  const showLive = live && !stale;
  const graph = (
    <CellGraphSlot cap={GRAPH_HEIGHT[cls]} head={<GraphHead live={live} />}>
      {(height) => <RouterGraph device={device} live={showLive} height={height} faint={stale} />}
    </CellGraphSlot>
  );
  return (
    <WideCard
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={<Visual cell={cell} cls={cls} live={live} />}
      chip={<CellBadge chip={cell.chip} />}
      state={<StateLine cell={cell} />}
      figures={figuresOf(cell)}
      graph={graph}
      actions={actions}
      ticker={cell.lastTest === null ? undefined : <CellLine text={cell.lastTest} />}
      log={snapshot.system === null ? undefined : <Gauges system={snapshot.system} />}
    />
  );
}

const COPY: CellCopy = {
  subject: 'Router',
  off: 'The router plugin is off',
  waiting: 'Waiting for the router',
  notSetUp: 'Connect it to see it here',
};

export function RouterCellFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const stream = useRouterSnapshot();
  const { run, list } = useSpeedTests();
  const last = list.state === 'ready' ? (list.tests[0] ?? null) : null;
  return (
    <CellGate
      device={device}
      cls={cls}
      pluginId={ROUTER_PLUGIN}
      glyph="router"
      copy={COPY}
      stream={stream}
    >
      {(snapshot, owner) => (
        <LiveCell>
          {(live) => (
            <>
              {live ? <RouterHold device={device} snapshot={snapshot} /> : null}
              <CellBody
                device={device}
                cls={cls}
                snapshot={snapshot}
                run={run}
                last={last}
                live={live}
                owner={owner}
              />
            </>
          )}
        </LiveCell>
      )}
    </CellGate>
  );
}
