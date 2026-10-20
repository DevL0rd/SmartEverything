import { DIFFUSER_STRENGTH_LABELS, type SprayRhythm } from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import { LOW_LEVEL } from '../../../components/level-pill-model';
import { joinParts } from '../../../format/text';
import { MINUTE_MS } from '../../../format/time';
import {
  automationRowsOf,
  scheduleOf as scheduleOfRows,
  type ScheduleLine,
} from '../../automations';
import type { OnSegment } from '../button/relay-model';
import type { DiffuserRead } from './diffuser-read';

export const RHYTHM_WINDOW_MINUTES = 120;

const DAY_HOURS = 24;
const REFILL_DAYS_FROM_HOURS = 72;

export interface DiffuserStatus {
  readonly tone: BadgeTone;
  readonly label: string;
}

export function diffuserStatus(read: DiffuserRead): DiffuserStatus {
  if (read.power === 'offline') {
    return { tone: 'neutral', label: 'Offline' };
  }
  if (read.fault) {
    return { tone: 'critical', label: 'Needs attention' };
  }
  if (read.power === 'on') {
    return { tone: 'positive', label: 'Scenting' };
  }
  return { tone: 'neutral', label: read.power === 'off' ? 'Off' : 'Waiting' };
}

export function isScenting(read: DiffuserRead): boolean {
  return read.power === 'on' && !read.fault;
}

export function lowBattery(read: DiffuserRead): boolean {
  return read.battery !== null && read.battery <= LOW_LEVEL;
}

function rhythmText(rhythm: SprayRhythm): string {
  return `every ${String(rhythm.intervalMinutes)} min · ${String(rhythm.durationSeconds)} s`;
}

const FAULT_LINE = 'Check the bottle and nozzle, then turn it off and on';

export function paused(read: DiffuserRead): boolean {
  return read.power !== 'on' || read.fault;
}

export function showsFault(read: DiffuserRead): boolean {
  return read.fault && read.power !== 'offline';
}

export function strengthLine(read: DiffuserRead): string | null {
  if (showsFault(read)) {
    return FAULT_LINE;
  }
  if (read.rhythm === null || read.strength === null) {
    return read.power === 'on' ? 'Waiting for the first reading' : null;
  }
  return `${DIFFUSER_STRENGTH_LABELS[read.strength]} · ${rhythmText(read.rhythm)}`;
}

export function stateText(read: DiffuserRead, room: string | null): string {
  return joinParts([strengthLine(read), showsFault(read) ? null : room]);
}

export function summaryOf({
  label,
  room,
  read,
}: {
  readonly label: string;
  readonly room: string | null;
  readonly read: DiffuserRead;
}): string {
  return [
    room === null ? label : `${label}, ${room}`,
    diffuserStatus(read).label,
    strengthLine(read),
    read.battery === null ? null : `battery ${String(read.battery)} percent`,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
}

export function sprayOffsets(intervalMinutes: number): readonly number[] {
  const count = Math.floor(RHYTHM_WINDOW_MINUTES / intervalMinutes) + 1;
  return Array.from({ length: count }, (_, index) => index * intervalMinutes);
}

export function sprayTicks(
  segments: readonly OnSegment[],
  intervalMinutes: number,
): readonly number[] {
  const every = intervalMinutes * MINUTE_MS;
  return segments.flatMap((segment) => {
    const count = Math.floor((segment.end - segment.start) / every) + 1;
    return Array.from({ length: count }, (_, index) => segment.start + index * every);
  });
}

export function refillLine(hours: number): string {
  return hours < REFILL_DAYS_FROM_HOURS
    ? `Running ${String(hours)} h since refill`
    : `Running ${String(Math.floor(hours / DAY_HOURS))} days since refill`;
}

export type { ScheduleLine };

export function scheduleOf(rows: readonly unknown[], deviceId: string): ScheduleLine | null {
  return scheduleOfRows(automationRowsOf(rows).rows, deviceId);
}
