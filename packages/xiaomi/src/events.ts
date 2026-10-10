import {
  JSON_VALUE,
  type DeviceEvent,
  type EventKind,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseUrn, type MiotSpec } from './spec';

const KIND_BY_MIOT_EVENT: ReadonlyMap<string, EventKind> = new Map<string, EventKind>([
  ['key-call-start', 'call'],
  ['phone-call-start', 'call'],
  ['doorbell-ring', 'doorbell'],
  ['someone-at-the-door', 'person'],
  ['someone-appeared', 'person'],
  ['people-fence-in', 'person'],
  ['people-fence-out', 'person'],
  ['pet-appeared', 'pet'],
  ['motion-detected', 'motion'],
  ['object-motion', 'motion'],
  ['abnormal-sound', 'sound'],
  ['louder-sound', 'sound'],
  ['detected-babycry-event', 'sound'],
  ['door-opened', 'opened'],
  ['top-grille', 'opened'],
  ['filter-exhausted', 'maintenance'],
  ['low-water-level', 'maintenance'],
  ['fault-motor-stuck', 'fault'],
  ['childlock-trigger', 'button'],
  ['cruise-started', 'activity'],
  ['cruise-ended', 'activity'],
  ['into-fav-area', 'activity'],
  ['out-fav-area', 'activity'],
  ['ir-turned-on', 'activity'],
  ['ir-turned-off', 'activity'],
  ['self-check-complete', 'activity'],
  ['long-time-no-humang', 'alarm'],
  ['no-huamn-appear', 'alarm'],
]);

export const CAMERA_LIST_EVENTS: ReadonlySet<string> = new Set([
  'someone-appeared',
  'pet-appeared',
  'object-motion',
  'motion-detected',
  'abnormal-sound',
  'louder-sound',
  'detected-babycry-event',
]);

const CALL_CALLING = 1;

export interface ObservedEvent {
  readonly externalId: string;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export function miotEventKind(name: string): EventKind | null {
  return KIND_BY_MIOT_EVENT.get(name) ?? null;
}

export function deviceEventFromMiot(name: string, observed: ObservedEvent): DeviceEvent | null {
  const kind = miotEventKind(name);
  return kind === null
    ? null
    : { ...observed, kind, details: { ...observed.details, miotEvent: name } };
}

export interface MiotEventShape {
  readonly name: string;
  readonly argumentNames: ReadonlyMap<number, string>;
}

export function miotEventOf(spec: MiotSpec, siid: number, eiid: number): MiotEventShape | null {
  const service = spec.services.find((candidate) => candidate.iid === siid);
  const event = service?.events.find((candidate) => candidate.iid === eiid);
  if (service === undefined || event === undefined) {
    return null;
  }
  const argumentNames = new Map(
    service.properties
      .filter((property) => event.arguments.includes(property.iid))
      .map((property) => [property.iid, parseUrn(property.type).name]),
  );
  return { name: parseUrn(event.type).name, argumentNames };
}

export function miotEventDetails(
  shape: MiotEventShape,
  values: readonly { readonly piid: number; readonly value: JsonValue }[],
): Record<string, JsonValue> {
  return Object.fromEntries(
    values.map(({ piid, value }) => [
      shape.argumentNames.get(piid) ?? `argument-${String(piid)}`,
      value,
    ]),
  );
}

export function callEventName(previous: JsonValue | undefined, next: JsonValue): string | null {
  return next === CALL_CALLING && previous !== CALL_CALLING ? 'key-call-start' : null;
}

const CAMERA_EVENT = z.object({
  createTime: z.number().int(),
  eventType: z.string(),
  fileId: z.string().optional(),
  isAlarm: z.boolean().optional(),
  imgStoreId: z.string().optional(),
});

const CAMERA_EVENT_PAGE = z.object({
  thirdPartPlayUnits: z.array(z.record(z.string(), JSON_VALUE)).default([]),
});

export type CameraEvent = z.infer<typeof CAMERA_EVENT>;

export interface CameraEventQuery {
  readonly did: string;
  readonly model: string;
  readonly region: string;
  readonly doorbell: boolean;
  readonly beginTime: number;
  readonly endTime: number;
  readonly limit: number;
}

export const CAMERA_EVENT_HOST = 'business.smartcamera.api.io.mi.com';
export const CAMERA_EVENT_PATH = '/common/app/get/eventlist';

export function cameraEventListData(query: CameraEventQuery): string {
  return JSON.stringify({
    did: query.did,
    model: query.model,
    doorBell: query.doorbell,
    eventType: 'Default',
    needMerge: true,
    sortType: 'DESC',
    region: query.region.toUpperCase(),
    language: 'en_US',
    beginTime: query.beginTime,
    endTime: query.endTime,
    limit: query.limit,
  });
}

export interface CameraEventPage {
  readonly events: readonly CameraEvent[];
  readonly malformed: number;
}

export function parseCameraEventPage(data: JsonValue): CameraEventPage {
  const page = CAMERA_EVENT_PAGE.safeParse(data);
  const units = page.success ? page.data.thirdPartPlayUnits : [];
  const events = units.flatMap((unit) => {
    const parsed = CAMERA_EVENT.safeParse(unit);
    return parsed.success ? [parsed.data] : [];
  });
  return { events, malformed: units.length - events.length + (page.success ? 0 : 1) };
}

const CAMERA_TOKENS: readonly (readonly [RegExp, EventKind])[] = [
  [/bell|ring/i, 'doorbell'],
  [/call/i, 'call'],
  [/people|face|person|human/i, 'person'],
  [/sound|cry/i, 'sound'],
  [/pet/i, 'pet'],
  [/motion/i, 'motion'],
];

export interface CameraEventKinds {
  readonly kinds: readonly EventKind[];
  readonly unrecognized: readonly string[];
}

export function cameraEventKinds(eventType: string): CameraEventKinds {
  const tokens = eventType.split(':').filter((token) => token !== '');
  const matches = tokens.map((token) => ({
    token,
    match: CAMERA_TOKENS.find(([pattern]) => pattern.test(token)),
  }));
  const kinds = new Set(matches.flatMap(({ match }) => (match === undefined ? [] : [match[1]])));
  return {
    kinds: [...kinds],
    unrecognized: matches.flatMap(({ token, match }) => (match === undefined ? [token] : [])),
  };
}
