import type { HistoryRow } from '@smarteverything/domain';
import type { ShellyDevice, ShellyZone } from '@smarteverything/shelly';
import type { TimelineSegment } from '../../components/charts';
import type { BadgeTone } from '../../components/badge';
import type { Tone } from '../../components/tone';
import { HOUR_MS } from '../../format/time';
import { zoneCount, zoneState } from './presence-model';
import { lightWord, statusLine, zoneName } from './room-map-legend';
import type { LiveSupport } from './tracking-leases';

export const OCCUPANCY_HOURS = 24;

export interface FaceChip {
  readonly label: string;
  readonly tone: BadgeTone;
}

const STATE_CHIPS: Readonly<Record<string, FaceChip>> = {
  Occupied: { label: 'Occupied', tone: 'info' },
  Clear: { label: 'Empty', tone: 'neutral' },
  Offline: { label: 'Offline', tone: 'neutral' },
  'Sensor fault': { label: 'Fault', tone: 'warning' },
  'Needs authentication': { label: 'Sign-in needed', tone: 'warning' },
  'Detection paused': { label: 'Detection off', tone: 'neutral' },
  Disabled: { label: 'Detection off', tone: 'neutral' },
};

export function chipOf(sensor: ShellyDevice, zone: ShellyZone | null): FaceChip {
  const state = zoneState(sensor, zone);
  return STATE_CHIPS[state] ?? { label: state, tone: 'neutral' };
}

export interface FaceLine {
  readonly text: string;
  readonly tone: Tone;
}

function occupiedZones(sensor: ShellyDevice): readonly string[] {
  return sensor.zones
    .filter((zone) => !zone.main && zoneState(sensor, zone) === 'Occupied')
    .map(zoneName);
}

function objects(count: string): string {
  return count === '1' ? '1 object' : `${count} objects`;
}

export function lineOf(
  sensor: ShellyDevice,
  zone: ShellyZone | null,
  support: LiveSupport | 'unknown',
  failed: boolean,
): FaceLine {
  if (support === 'offline') return { text: statusLine(sensor), tone: 'variant' };
  if (failed) return { text: 'Couldn’t start live view', tone: 'warning' };
  const state = zoneState(sensor, zone);
  const light = lightWord(sensor);
  if (state !== 'Occupied')
    return {
      text: [state === 'Clear' ? 'Quiet' : state, light]
        .filter((part) => part !== null)
        .join(' · '),
      tone: 'variant',
    };
  const parts = [objects(zoneCount(sensor, zone)), ...occupiedZones(sensor), light];
  if (support === 'unsupported') parts.push('No live view');
  return { text: parts.filter((part) => part !== null).join(' · '), tone: 'primary' };
}

export function summaryOf(name: string, chip: FaceChip, line: FaceLine): string {
  return `${name}, ${chip.label.toLowerCase()}, ${line.text}`;
}

export function occupiedSegments(
  rows: readonly HistoryRow[],
  to: number,
): readonly TimelineSegment<'occupied'>[] {
  const changes = rows
    .map((row) => ({ at: Date.parse(row.observed_at), on: row.value === true }))
    .sort((left, right) => left.at - right.at);
  const segments: TimelineSegment<'occupied'>[] = [];
  let since: number | null = null;
  for (const change of changes) {
    if (change.on && since === null) since = change.at;
    if (!change.on && since !== null) {
      segments.push({ start: since, end: change.at, state: 'occupied' });
      since = null;
    }
  }
  if (since !== null) segments.push({ start: since, end: to, state: 'occupied' });
  return segments;
}

export function occupancyWindow(to: number): { readonly from: number; readonly to: number } {
  return { from: to - OCCUPANCY_HOURS * HOUR_MS, to };
}
