import tzLookup from '@photostructure/tz-lookup';
import type { MediaFacts, Moment } from './metadata-read';

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const WALL_LENGTH = 19;
const WALL = /^(?<wall>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z$/;
const LONG_OFFSET = /^GMT(?:(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2}))?$/;

export type ZoneSource = 'gps' | 'device' | 'hub';

export interface LocalZone {
  readonly zone: string;
  readonly source: ZoneSource;
}

export interface Device {
  readonly make: string;
  readonly model: string;
}

export interface ZoneEvidence extends Device {
  readonly wallAt: string;
  readonly zone: string;
}

export interface DeviceZones {
  readonly nearest: (device: Device, wallAt: string, exceptItemId: string) => string | null;
  readonly keep: (itemId: string, evidence: ZoneEvidence | null) => void;
}

export interface ZonePicker {
  readonly pick: (itemId: string, facts: MediaFacts) => LocalZone;
  readonly keep: (itemId: string, facts: MediaFacts) => void;
}

type ZoneFacts = Pick<MediaFacts, 'takenAt' | 'place' | 'camera'>;

export class MissingZoneError extends Error {
  constructor(what: string) {
    super(`No time zone is known for a photo time without a zone: ${what}.`);
    this.name = 'MissingZoneError';
  }
}

export function isZoneless(moment: Moment | null): moment is Moment {
  return moment !== null && moment.source === 'metadata' && moment.offsetMin === null;
}

function zoneOffsetMin(zone: string, atMs: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(atMs))
    .find((part) => part.type === 'timeZoneName')?.value;
  const groups = LONG_OFFSET.exec(name ?? '')?.groups;
  if (groups === undefined) throw new MissingZoneError(`the zone ${zone} has no readable offset`);
  if (groups['sign'] === undefined) return 0;
  const minutes = Number(groups['hours']) * MINUTES_PER_HOUR + Number(groups['minutes']);
  return groups['sign'] === '-' ? -minutes : minutes;
}

export function offsetText(offsetMin: number): string {
  const sign = offsetMin < 0 ? '-' : '+';
  const whole = Math.abs(offsetMin);
  const hours = String(Math.floor(whole / MINUTES_PER_HOUR)).padStart(2, '0');
  const minutes = String(whole % MINUTES_PER_HOUR).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

export function inZone(moment: Moment, local: LocalZone): Moment {
  const wall = WALL.exec(moment.iso)?.groups?.['wall'];
  if (wall === undefined) throw new MissingZoneError(`the time ${moment.iso} is not a wall time`);
  const wallMs = Date.parse(`${wall}Z`);
  const guess = zoneOffsetMin(local.zone, wallMs);
  const offsetMin = zoneOffsetMin(local.zone, wallMs - guess * MS_PER_MINUTE);
  return { iso: `${wall}${offsetText(offsetMin)}`, offsetMin, source: moment.source };
}

export function gpsZone(place: NonNullable<MediaFacts['place']>): string {
  return tzLookup(place.lat, place.lon);
}

export function deviceOf(camera: MediaFacts['camera']): Device | null {
  const make = camera?.make ?? null;
  const model = camera?.model ?? null;
  return make === null || model === null ? null : { make, model };
}

function localWall(moment: Moment): string | null {
  return moment.offsetMin === 0 && moment.iso.endsWith('Z')
    ? null
    : moment.iso.slice(0, WALL_LENGTH);
}

export function zoneEvidence(facts: ZoneFacts): ZoneEvidence | null {
  const device = deviceOf(facts.camera);
  const moment = facts.takenAt;
  const wallAt = moment === null ? null : localWall(moment);
  if (device === null || moment === null || wallAt === null) return null;
  if (facts.place !== null) return { ...device, wallAt, zone: gpsZone(facts.place) };
  return moment.offsetMin === null
    ? null
    : { ...device, wallAt, zone: offsetText(moment.offsetMin) };
}

export function waitsForDevice(facts: ZoneFacts): boolean {
  return isZoneless(facts.takenAt) && facts.place === null && deviceOf(facts.camera) !== null;
}

export function zonePicker(devices: DeviceZones, hubZone: () => string): ZonePicker {
  return {
    pick: (itemId, facts): LocalZone => {
      if (facts.place !== null) return { zone: gpsZone(facts.place), source: 'gps' };
      const device = deviceOf(facts.camera);
      const wallAt = facts.takenAt === null ? null : localWall(facts.takenAt);
      const zone =
        device === null || wallAt === null ? null : devices.nearest(device, wallAt, itemId);
      return zone === null ? { zone: hubZone(), source: 'hub' } : { zone, source: 'device' };
    },
    keep: (itemId, facts): void => {
      devices.keep(itemId, zoneEvidence(facts));
    },
  };
}
