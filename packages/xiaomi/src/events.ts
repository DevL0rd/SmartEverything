import {
  CAMERA_DETECTION_KINDS,
  JSON_VALUE,
  miotDeviceEventKind,
  type CameraDetection,
  type DeviceEvent,
  type EventKind,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseUrn, type MiotSpec } from './spec';

interface DetectionSource {
  readonly detection: CameraDetection;
  readonly miotEvents: readonly string[];
  readonly cloudToken: RegExp;
}

const DETECTION_SOURCES: readonly DetectionSource[] = [
  { detection: 'doorbell', miotEvents: ['doorbell-ring'], cloudToken: /bell|ring/i },
  { detection: 'call', miotEvents: ['key-call-start', 'phone-call-start'], cloudToken: /call/i },
  {
    detection: 'person',
    miotEvents: ['someone-appeared', 'someone-at-the-door'],
    cloudToken: /people|face|person|human/i,
  },
  { detection: 'baby_cry', miotEvents: ['detected-babycry-event'], cloudToken: /cry/i },
  { detection: 'abnormal_sound', miotEvents: ['abnormal-sound'], cloudToken: /abnormal/i },
  { detection: 'loud_sound', miotEvents: ['louder-sound'], cloudToken: /sound/i },
  { detection: 'pet', miotEvents: ['pet-appeared'], cloudToken: /pet/i },
  { detection: 'motion', miotEvents: ['object-motion', 'motion-detected'], cloudToken: /motion/i },
];

const CALL_CALLING = 1;

export interface ObservedEvent {
  readonly externalId: string;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export function miotDetection(name: string): CameraDetection | null {
  return DETECTION_SOURCES.find((source) => source.miotEvents.includes(name))?.detection ?? null;
}

export function miotEventKind(name: string): EventKind | null {
  const detection = miotDetection(name);
  return detection === null ? miotDeviceEventKind(name) : CAMERA_DETECTION_KINDS[detection];
}

export function deviceEventFromMiot(name: string, observed: ObservedEvent): DeviceEvent | null {
  const kind = miotEventKind(name);
  const detection = miotDetection(name);
  const named = { ...observed.details, miotEvent: name };
  return kind === null
    ? null
    : { ...observed, kind, details: detection === null ? named : { ...named, detection } };
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

export interface CameraEventDetections {
  readonly detections: readonly CameraDetection[];
  readonly unrecognized: readonly string[];
}

export function cameraEventDetections(eventType: string): CameraEventDetections {
  const tokens = eventType.split(':').filter((token) => token !== '');
  const matches = tokens.map((token) => ({
    token,
    match: DETECTION_SOURCES.find(({ cloudToken }) => cloudToken.test(token)),
  }));
  const detections = new Set(
    matches.flatMap(({ match }) => (match === undefined ? [] : [match.detection])),
  );
  return {
    detections: [...detections],
    unrecognized: matches.flatMap(({ token, match }) => (match === undefined ? [token] : [])),
  };
}
