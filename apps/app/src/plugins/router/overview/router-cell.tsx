import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gauge, type GaugeBand } from '../../../components/charts';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { WideCard, WideFigure, type WideClass, type WideFrame } from '../../../features/devices';
import { CellGate, type CellCopy } from '../../shared/cell-gate';
import { CellGraphSlot } from '../../shared/cell-graph';
import { LiveCell } from '../../shared/cell-live';
import { CellBadge, CellLine, CellPluginAction, LegendDot } from '../../shared/cell-parts';
import { cellMedallionSize, type MedallionTone } from '../../shared/medallion-model';
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

interface VisualProps {
  readonly tone: MedallionTone;
  readonly ratio: number | null;
  readonly offline: boolean;
  readonly pulse: boolean;
  readonly label: string;
  readonly cls: WideClass;
}

function Visual({ tone, ratio, offline, pulse, label, cls }: VisualProps): ReactNode {
  return (
    <ServiceMedallion
      glyph="router"
      tone={tone}
      ratio={ratio}
      live={pulse}
      size={cellMedallionSize(cls)}
      label={label}
      offline={offline}
      ticking
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

interface GaugesProps {
  readonly cpu: number;
  readonly memory: number;
  readonly temperature: number | null;
}

function Gauges({ cpu, memory, temperature }: GaugesProps): ReactNode {
  const readings = systemReadingsOf({
    cpuPercent: cpu,
    memoryUsedPercent: memory,
    temperatureCelsius: temperature,
  });
  return (
    <View className="flex-row items-center gap-5" aria-hidden>
      {readings.map((reading) => (
        <View key={reading.key} className="flex-row items-center gap-2">
          <Gauge
            value={reading.value}
            min={0}
            max={100}
            size={GAUGE_PX}
            label={`${reading.label} ${reading.text}`}
            bands={GAUGE_BANDS}
            ticking
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

function gaugesOf(
  cpu: number | null,
  memory: number | null,
  temperature: number | null,
): ReactNode {
  return cpu === null || memory === null ? undefined : (
    <Gauges cpu={cpu} memory={memory} temperature={temperature} />
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
  readonly kind: RouterCell['kind'];
  readonly canRun: boolean;
  readonly owner: boolean;
}

function useCellActions({ device, cls, kind, canRun, owner }: ActionInput): readonly ReactNode[] {
  const actions = useRouterActions();
  if (kind === 'stale') {
    return [];
  }
  const restart = owner ? (
    <CellPluginAction
      key="wifi"
      cls={cls}
      label="Restart Wi-Fi"
      variant={kind === 'down' ? 'tonal' : 'text'}
      confirmation={RESTART_WIFI}
      onPress={actions.restartWifi}
    />
  ) : null;
  if (kind === 'down') {
    return restart === null ? [] : [restart];
  }
  const test = (
    <CellPluginAction
      key="test"
      cls={cls}
      label={kind === 'testing' ? 'Testing…' : 'Speed test'}
      variant="tonal"
      icon="gauge"
      loading={kind === 'testing'}
      disabled={!canRun}
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

function StateLine({
  text,
  tone,
}: {
  readonly text: string | null;
  readonly tone: Tone;
}): ReactNode {
  return text === null ? null : <CellLine text={text} tone={tone} />;
}

interface GraphSlotProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly live: boolean;
  readonly stale: boolean;
}

function GraphSlot({ device, cls, live, stale }: GraphSlotProps): ReactNode {
  const showLive = live && !stale;
  return (
    <CellGraphSlot cap={GRAPH_HEIGHT[cls]} head={<GraphHead live={live} />}>
      {(height) => <RouterGraph device={device} live={showLive} height={height} faint={stale} />}
    </CellGraphSlot>
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
  readonly frame: WideFrame;
}

function CellBody({
  device,
  cls,
  snapshot,
  run,
  last,
  live,
  owner,
  frame,
}: CellBodyProps): ReactNode {
  const now = useMinute();
  const cell = routerCellOf(snapshot, run, last, now);
  const figures = figuresOf(cell);
  const actions = useCellActions({ device, cls, kind: cell.kind, canRun: cell.canRun, owner });
  const { system } = snapshot;
  const cpu = system === null ? null : system.cpuPercent;
  const memory = system === null ? null : system.memoryUsedPercent;
  const temperature = system === null ? null : system.temperatureCelsius;
  const stale = cell.kind === 'stale';
  const pulse = live && cell.kind === 'testing';
  return (
    <WideCard
      frame={frame}
      cls={cls}
      summary={cell.spoken}
      title={device.label}
      visual={
        <Visual
          tone={cell.tone}
          ratio={cell.ratio}
          offline={stale}
          pulse={pulse}
          label={cell.spoken}
          cls={cls}
        />
      }
      chip={<CellBadge chip={cell.chip} />}
      state={<StateLine text={cell.line} tone={cell.kind === 'down' ? 'critical' : 'variant'} />}
      figures={figures}
      graph={<GraphSlot device={device} cls={cls} live={live} stale={stale} />}
      actions={actions}
      ticker={cell.lastTest === null ? undefined : <CellLine text={cell.lastTest} />}
      log={gaugesOf(cpu, memory, temperature)}
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
          {(live, frame) => (
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
                frame={frame}
              />
            </>
          )}
        </LiveCell>
      )}
    </CellGate>
  );
}
