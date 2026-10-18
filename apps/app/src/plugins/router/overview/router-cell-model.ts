import { formatMegabits, type RouterSnapshot, type SpeedTestResult } from '@smarteverything/domain';
import { decimal, milliseconds } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { moment } from '../../../format/time';
import type { CellChip } from '../../shared/cell-parts';
import type { MedallionTone } from '../../shared/medallion-model';
import type { SpeedTestRun } from '../router-data';
import { phaseShare } from '../widgets/speed-progress';
import { staleCaptionOf } from '../widgets/stale-caption';
import { heroOf, rateParts } from './hero-model';

type RouterCellKind = 'online' | 'testing' | 'down' | 'stale';

interface CellFigure {
  readonly value: string;
  readonly unit: string;
  readonly caption: string;
}

export interface RouterCell {
  readonly kind: RouterCellKind;
  readonly chip: CellChip;
  readonly tone: MedallionTone;
  readonly ratio: number | null;
  readonly line: string;
  readonly figures: readonly CellFigure[];
  readonly lastTest: string | null;
  readonly spoken: string;
  readonly canRun: boolean;
  readonly reason: string | null;
}

function onlineCount(snapshot: RouterSnapshot): number {
  return snapshot.clients.filter((client) => client.connected).length;
}

function onlineLine(snapshot: RouterSnapshot): string {
  const { network } = snapshot;
  const latency = network?.latencyMs;
  const loss = network?.packetLossPercent;
  return joinParts([
    plural(onlineCount(snapshot), 'device'),
    latency === null || latency === undefined ? null : milliseconds(latency),
    loss === null || loss === undefined ? null : `${decimal(loss)} % loss`,
  ]);
}

function lastTestText(last: SpeedTestResult | null, now: number): string | null {
  return last === null
    ? null
    : `Test ${formatMegabits(last.downloadMbps)} ↓ ${formatMegabits(last.uploadMbps)} ↑ · ${moment(last.at, now)}`;
}

function pairOf(down: number, up: number): readonly CellFigure[] {
  const download = rateParts(down);
  const upload = rateParts(up);
  return [
    { ...download, caption: 'down' },
    { ...upload, caption: 'up' },
  ];
}

function staleChip(connection: RouterSnapshot['connection']): CellChip {
  switch (connection.state) {
    case 'paused':
      return { tone: 'warning', label: 'Paused' };
    case 'connecting':
      return { tone: 'info', label: 'Connecting…' };
    case 'online':
    case 'not_set_up':
    case 'unreachable':
      return { tone: 'neutral', label: 'Not reachable' };
  }
}

function spokenOf(chip: CellChip, figures: readonly CellFigure[], line: string): string {
  const [down, up] = figures;
  const rates =
    down === undefined || up === undefined
      ? []
      : [`download ${down.value} ${down.unit}`, `upload ${up.value} ${up.unit}`];
  return ['Router', chip.label.toLowerCase(), ...rates, line].join(', ');
}

function staleCell(snapshot: RouterSnapshot, now: number): RouterCell {
  const caption = staleCaptionOf(snapshot.connection, now);
  const chip = staleChip(snapshot.connection);
  const line = caption?.long ?? 'Not reachable';
  const figures =
    snapshot.network === null
      ? []
      : pairOf(snapshot.network.downloadMbps, snapshot.network.uploadMbps);
  return {
    kind: 'stale',
    chip,
    tone: 'neutral',
    ratio: null,
    line,
    figures,
    lastTest: null,
    spoken: spokenOf(chip, [], line),
    canRun: false,
    reason: line,
  };
}

function testingCell(snapshot: RouterSnapshot, run: SpeedTestRun): RouterCell {
  const chip: CellChip = { tone: 'info', label: 'Testing…' };
  const line = run.line ?? 'Speed test running';
  const download = rateParts(run.mbps);
  return {
    kind: 'testing',
    chip,
    tone: 'info',
    ratio: phaseShare(run.phase),
    line,
    figures: [{ ...download, caption: 'so far' }],
    lastTest: null,
    spoken: spokenOf(chip, [], `${line}, ${plural(onlineCount(snapshot), 'device')}`),
    canRun: false,
    reason: null,
  };
}

function downCell(): RouterCell {
  const chip: CellChip = { tone: 'critical', label: 'No internet' };
  const line = 'No internet · the router is fine';
  return {
    kind: 'down',
    chip,
    tone: 'critical',
    ratio: null,
    line,
    figures: [],
    lastTest: null,
    spoken: spokenOf(chip, [], line),
    canRun: false,
    reason: null,
  };
}

export function routerCellOf(
  snapshot: RouterSnapshot,
  run: SpeedTestRun,
  last: SpeedTestResult | null,
  now: number,
): RouterCell {
  const hero = heroOf(snapshot, last);
  if (hero.stale) {
    return staleCell(snapshot, now);
  }
  if (run.running) {
    return testingCell(snapshot, run);
  }
  if (hero.tone === 'critical') {
    return downCell();
  }
  const chip: CellChip = { tone: 'positive', label: 'Online' };
  const line = onlineLine(snapshot);
  const figures = snapshot.network
    ? pairOf(snapshot.network.downloadMbps, snapshot.network.uploadMbps)
    : [];
  return {
    kind: 'online',
    chip,
    tone: hero.tone,
    ratio: hero.ratio,
    line,
    figures,
    lastTest: lastTestText(last, now),
    spoken: spokenOf(chip, figures, line),
    canRun: hero.canRun,
    reason: null,
  };
}

export interface SystemReading {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly text: string;
}

export function systemReadingsOf(
  system: NonNullable<RouterSnapshot['system']>,
): readonly SystemReading[] {
  const temperature = system.temperatureCelsius;
  return [
    {
      key: 'cpu',
      label: 'CPU',
      value: system.cpuPercent,
      text: `${decimal(system.cpuPercent)} %`,
    },
    {
      key: 'mem',
      label: 'Memory',
      value: system.memoryUsedPercent,
      text: `${decimal(system.memoryUsedPercent)} %`,
    },
    ...(temperature === null
      ? []
      : [
          { key: 'temp', label: 'Temp', value: temperature, text: `${decimal(temperature, 1)} °C` },
        ]),
  ];
}
