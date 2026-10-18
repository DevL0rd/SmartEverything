import { formatByteRate, type ComputerParts, type ComputerSummary } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { clock, DAY_MS, duration, HOUR_MS, MINUTE_MS } from '../../../format/time';
import type { MedallionTone } from '../../../plugins/shared/medallion-model';

const HOT_CELSIUS = 90;
export const WARM_CELSIUS = 85;
export const BUSY_PERCENT = 90;
export const BUSY_SPAN_MS = 10_000;
const NEARLY_FULL_PERCENT = 95;
const GETTING_FULL_PERCENT = 85;

export interface RateParts {
  readonly value: string;
  readonly unit: string;
}

export function rateParts(bytesPerSecond: number): RateParts {
  const [value = '0', unit = 'B/s'] = formatByteRate(bytesPerSecond).split(' ');
  return { value, unit };
}

interface BatteryState {
  readonly state: 'charging' | 'discharging' | 'full' | 'idle' | 'unknown';
  readonly minutesLeft: number | null;
}

export interface StatusInput {
  readonly online: boolean;
  readonly seenAt: string | null;
  readonly locked: boolean | null;
  readonly hottest: number | null;
  readonly throttled: boolean | null;
  readonly busy: boolean;
  readonly battery: BatteryState | null;
}

export interface ComputerStatus {
  readonly word: string;
  readonly tone: MedallionTone;
  readonly offline: boolean;
}

export function sustainedAbove(
  points: readonly ChartPoint[],
  threshold: number,
  spanMs: number,
): boolean {
  const newest = points.at(-1);
  if (newest === undefined) return false;
  const oldest = points[0];
  if (oldest === undefined || newest.t - oldest.t < spanMs) return false;
  return points.filter((point) => point.t >= newest.t - spanMs).every((p) => p.v >= threshold);
}

function minutesText(minutes: number | null): string {
  return minutes === null ? '' : ` · ${duration(minutes * 60)}`;
}

function powerStatus(battery: BatteryState | null): ComputerStatus | null {
  if (battery?.state === 'discharging') {
    const left = battery.minutesLeft === null ? '' : `${minutesText(battery.minutesLeft)} left`;
    return { word: `On battery${left}`, tone: 'info', offline: false };
  }
  if (battery?.state === 'charging') {
    const full =
      battery.minutesLeft === null ? '' : ` · full in ${duration(battery.minutesLeft * 60)}`;
    return { word: `Charging${full}`, tone: 'info', offline: false };
  }
  return null;
}

export function statusOf(input: StatusInput): ComputerStatus {
  if (!input.online) {
    const since = input.seenAt === null ? '' : ` since ${clock(input.seenAt)}`;
    return { word: `Offline${since}`, tone: 'neutral', offline: true };
  }
  if (input.locked === true) return { word: 'Locked', tone: 'info', offline: false };
  if (input.throttled === true || (input.hottest !== null && input.hottest >= HOT_CELSIUS)) {
    return { word: 'Running hot', tone: 'warning', offline: false };
  }
  if (input.busy) return { word: 'Very busy', tone: 'warning', offline: false };
  return (
    powerStatus(input.battery) ?? { word: 'Running smoothly', tone: 'positive', offline: false }
  );
}

export function hottestOf(summary: ComputerSummary | undefined): number | null {
  if (summary === undefined) return null;
  const temperatures = [summary.cpuTemperature, summary.gpuTemperature].filter(
    (value) => value !== null,
  );
  return temperatures.length === 0 ? null : Math.max(...temperatures);
}

export interface DiskSeverity {
  readonly word: string | null;
  readonly tone: 'warning' | 'critical' | null;
}

export function diskSeverity(percent: number): DiskSeverity {
  if (percent >= NEARLY_FULL_PERCENT) return { word: 'Almost full', tone: 'critical' };
  if (percent >= GETTING_FULL_PERCENT) return { word: 'Getting full', tone: 'warning' };
  return { word: null, tone: null };
}

export function hotWord(celsius: number | null): string | null {
  return celsius !== null && celsius >= WARM_CELSIUS ? 'Hot' : null;
}

export function uptimeText(seconds: number): string {
  const ms = seconds * 1000;
  if (ms >= DAY_MS) return `${decimal(Math.floor(ms / DAY_MS))} d`;
  if (ms >= HOUR_MS) return `${decimal(Math.floor(ms / HOUR_MS))} h`;
  return `${decimal(Math.floor(ms / MINUTE_MS))} min`;
}

export function factsLine(summary: ComputerSummary): string {
  return joinParts([
    summary.cpuTemperature === null ? null : `${decimal(summary.cpuTemperature)} °C`,
    summary.totalWatts === null ? null : `${decimal(summary.totalWatts)} W`,
    `up ${uptimeText(summary.uptimeSeconds)}`,
  ]);
}

function audioSummary(session: ComputerParts['session']): string | null {
  if (session === undefined) return null;
  if (session.muted === true) return 'Muted';
  return session.volume === null ? null : `${decimal(session.volume)} %`;
}

function networkSummary(summary: ComputerSummary): string {
  const rate = rateParts(summary.downloadRate);
  return `↓ ${rate.value} ${rate.unit}`;
}

function storageSummary(summary: ComputerSummary): string | null {
  return summary.fullestDisk === null ? null : `${decimal(summary.fullestDisk.percent)} % full`;
}

function batterySummary(summary: ComputerSummary): string | null {
  return summary.batteryLevel === null ? null : `${decimal(summary.batteryLevel)} %`;
}

export function railSummaryOf(id: string, parts: ComputerParts): string | null {
  const { summary } = parts;
  if (id === 'audio') return audioSummary(parts.session);
  if (summary === undefined) return null;
  switch (id) {
    case 'performance':
      return `${decimal(summary.cpuLoad)} % CPU`;
    case 'processes':
      return decimal(summary.processCount);
    case 'network':
      return networkSummary(summary);
    case 'storage':
      return storageSummary(summary);
    case 'system':
      return batterySummary(summary);
    default:
      return null;
  }
}
