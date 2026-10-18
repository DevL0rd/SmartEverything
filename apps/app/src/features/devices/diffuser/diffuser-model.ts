import {
  DIFFUSER_STRENGTH_LABELS,
  type AutomationRow,
  type AutomationV2,
  type SprayRhythm,
  type StepV2,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import { LOW_LEVEL } from '../../../components/level-pill-model';
import { compareText, joinParts } from '../../../format/text';
import { MINUTE_MS } from '../../../format/time';
import { storedAutomationOf } from '../../automations';
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

export interface ScheduleLine {
  readonly text: string;
  readonly automationId: string;
}

interface PowerChange {
  readonly at: string;
  readonly on: boolean;
  readonly automationId: string;
}

function targetsDevice(step: StepV2, deviceId: string): boolean {
  if (step.do !== 'set') {
    return false;
  }
  const { target } = step;
  if ('device' in target) {
    return target.device === deviceId;
  }
  return 'devices' in target && target.devices.includes(deviceId);
}

function changesOf(
  automation: AutomationV2,
  automationId: string,
  deviceId: string,
): readonly PowerChange[] {
  const times = automation.when.flatMap((trigger) => (trigger.on === 'time' ? [trigger.at] : []));
  const flips = automation.steps.flatMap((step) =>
    step.do === 'set' &&
    step.control === 'power' &&
    typeof step.to === 'boolean' &&
    targetsDevice(step, deviceId)
      ? [step.to]
      : [],
  );
  return times.flatMap((at) => flips.map((on) => ({ at, on, automationId })));
}

export function scheduleOf(rows: readonly AutomationRow[], deviceId: string): ScheduleLine | null {
  const changes = rows
    .filter((row) => row.enabled)
    .flatMap((row) => {
      const automation = storedAutomationOf(row);
      return automation === null ? [] : changesOf(automation, row.id, deviceId);
    })
    .sort((left, right) => Number(right.on) - Number(left.on) || compareText(left.at, right.at));
  const [first] = changes;
  if (first === undefined) {
    return null;
  }
  const words = changes.map((change) => `${change.on ? 'on' : 'off'} ${change.at}`);
  const text = words.join(' · ');
  return {
    text: `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
    automationId: first.automationId,
  };
}
