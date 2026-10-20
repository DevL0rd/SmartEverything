import { z } from 'zod';
import { HANDLE_STATES, type BrushDelta } from './delta';
import { CondorFramingError } from './errors';
import { decodeSensorFrame } from './sensor';
import { bytesToHex } from '../bytes';

export const MESSAGE = {
  initializeReq: 1,
  initializeResp: 2,
  putProps: 3,
  getProps: 4,
  subscribe: 5,
  unsubscribe: 6,
  genericResp: 7,
  changeInd: 8,
  changeIndResp: 9,
  getProds: 10,
  getPorts: 11,
} as const;

export const STATUS_OK = 0;

export const STATUS_NAMES = [
  'NoError',
  'NotUnderstood',
  'OutOfMemory',
  'NoSuchPort',
  'NotImplemented',
  'VersionNotSupported',
  'NoSuchProperty',
  'NoSuchOperation',
  'NoSuchProduct',
  'PropertyAlreadyExists',
  'NoSuchMethod',
  'WrongParameters',
  'InvalidParameter',
  'NotSubscribed',
  'ProtocolViolation',
] as const;

export const SUBSCRIBE_TIMEOUT_SECONDS = 31_536_000;

export const PRODUCT = '1';

export const STATE_PORTS = [
  'Sonicare',
  'RoutineStatus',
  'Battery',
  'BrushHead',
  'SessionStorage',
  'Diagnostics',
  'Extended',
  'SensorData',
] as const;

export const SENSOR_PORT = 'SensorData.b';

export const DEFAULT_PACKET_SIZE = 20;

const SEQUENCE_MASK = 0x3f;

const HEADER_LENGTH = 5;

const ENCODER = new TextEncoder();

const DECODER = new TextDecoder();

function joinBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

const NUL = new Uint8Array([0]);

export function frameOf(type: number, body: Uint8Array = new Uint8Array(0)): Uint8Array {
  return joinBytes(
    new Uint8Array([0xfe, 0xff, type, (body.length >> 8) & 0xff, body.length & 0xff]),
    body,
  );
}

function addressOf(product: string, port: string): Uint8Array {
  return joinBytes(ENCODER.encode(product), NUL, ENCODER.encode(port), NUL);
}

export function getPropsFrame(port: string): Uint8Array {
  return frameOf(MESSAGE.getProps, addressOf(PRODUCT, port));
}

export function subscribeFrame(port: string): Uint8Array {
  const timeout = ENCODER.encode(JSON.stringify({ timeout: SUBSCRIBE_TIMEOUT_SECONDS }));
  return frameOf(MESSAGE.subscribe, joinBytes(addressOf(PRODUCT, port), timeout));
}

export function putPropsFrame(port: string, props: Readonly<Record<string, number>>): Uint8Array {
  return frameOf(
    MESSAGE.putProps,
    joinBytes(addressOf(PRODUCT, port), ENCODER.encode(JSON.stringify(props))),
  );
}

export function getPortsFrame(product: string): Uint8Array {
  return frameOf(MESSAGE.getPorts, joinBytes(ENCODER.encode(product), NUL));
}

export function changeIndResponseFrame(): Uint8Array {
  return frameOf(MESSAGE.changeIndResp, new Uint8Array([STATUS_OK, 0]));
}

export interface ChunkedFrame {
  readonly chunks: readonly Uint8Array[];
  readonly nextSequence: number;
}

export function chunksOf(
  frame: Uint8Array,
  firstSequence: number,
  maxPacket: number = DEFAULT_PACKET_SIZE,
): ChunkedFrame {
  const room = Math.max(maxPacket - 1, 1);
  const chunks: Uint8Array[] = [];
  let sequence = firstSequence;
  for (let offset = 0; offset < frame.length; offset += room) {
    chunks.push(
      joinBytes(new Uint8Array([sequence & SEQUENCE_MASK]), frame.subarray(offset, offset + room)),
    );
    sequence = (sequence + 1) % 64;
  }
  return { chunks, nextSequence: sequence };
}

export interface CondorMessage {
  readonly type: number;
  readonly body: Uint8Array;
}

export interface Pushed {
  readonly ack: number | null;
  readonly messages: readonly CondorMessage[];
}

export class CondorAssembler {
  private buffer: Uint8Array = new Uint8Array(0);

  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  push(notification: Uint8Array): Pushed {
    const header = notification[0];
    if (header === undefined) {
      return { ack: null, messages: [] };
    }
    this.buffer = joinBytes(this.buffer, notification.subarray(1));
    return { ack: header & SEQUENCE_MASK, messages: this.drain() };
  }

  private drain(): CondorMessage[] {
    const messages: CondorMessage[] = [];
    while (this.buffer.length >= HEADER_LENGTH) {
      if (this.buffer[0] !== 0xfe || this.buffer[1] !== 0xff) {
        const seen = bytesToHex(this.buffer.subarray(0, 8));
        this.reset();
        throw new CondorFramingError('a frame must start with fe ff', seen);
      }
      const length = ((this.buffer[3] ?? 0) << 8) | (this.buffer[4] ?? 0);
      if (this.buffer.length < HEADER_LENGTH + length) {
        break;
      }
      messages.push({
        type: this.buffer[2] ?? 0,
        body: this.buffer.slice(HEADER_LENGTH, HEADER_LENGTH + length),
      });
      this.buffer = this.buffer.slice(HEADER_LENGTH + length);
    }
    return messages;
  }
}

export interface Indication {
  readonly product: string;
  readonly port: string;
  readonly body: Uint8Array;
}

export function parseChangeInd(body: Uint8Array): Indication {
  const split = body.indexOf(0);
  const header = split < 0 ? '' : DECODER.decode(body.subarray(0, split));
  const slash = header.indexOf('/');
  if (slash < 0) {
    throw new CondorFramingError('a change indication names product/port', bytesToHex(body));
  }
  return {
    product: header.slice(0, slash),
    port: header.slice(slash + 1),
    body: body.slice(split + 1),
  };
}

export interface Answer {
  readonly status: number;
  readonly json: unknown;
}

export function parseGenericResp(body: Uint8Array): Answer {
  const status = body[0];
  if (status === undefined) {
    throw new CondorFramingError('a response carries a status byte', '');
  }
  const text = DECODER.decode(body.subarray(1)).replaceAll('\0', '').trim();
  return { status, json: text === '' ? null : JSON.parse(text) };
}

export function jsonOfIndication(indication: Indication): unknown {
  const text = DECODER.decode(indication.body).replaceAll('\0', '').trim();
  return text === '' ? null : JSON.parse(text);
}

const NUMBER = z.number();

const BYTES = z.array(z.number().int().min(0).max(255));

const SONICARE_PORT = z.looseObject({
  HandleState: NUMBER.optional(),
  RoutineIDs: BYTES.optional(),
  HandleTime: NUMBER.optional(),
});

const ROUTINE_PORT = z.looseObject({
  SessionID: NUMBER.optional(),
  Mode: NUMBER.optional(),
  Duration: NUMBER.optional(),
  Length: NUMBER.optional(),
  Intensity: NUMBER.optional(),
});

const BATTERY_PORT = z.looseObject({
  BatteryPercent: NUMBER.optional(),
  BatteryMV: NUMBER.optional(),
});

const HEAD_PORT = z.looseObject({
  SerialNumber: BYTES.optional(),
  LifetimeLimit: NUMBER.optional(),
  LifetimeUsage: NUMBER.optional(),
  RingId: NUMBER.optional(),
  NfcTagVersion: BYTES.optional(),
});

const STORAGE_PORT = z.looseObject({ LatestID: NUMBER.optional(), Count: NUMBER.optional() });

const DIAGNOSTICS_PORT = z.looseObject({ PErrors: NUMBER.optional(), VErrors: NUMBER.optional() });

const EXTENDED_PORT = z.looseObject({ FeatureCtrl: NUMBER.optional() });

const SENSOR_PORT_PROPS = z.looseObject({ Sensors: NUMBER.optional() });

const FIRMWARE_PORT = z.looseObject({
  name: z.string().optional(),
  version: z.string().optional(),
});

function sonicareDelta(props: unknown): BrushDelta {
  const parsed = SONICARE_PORT.parse(props);
  const running = parsed.HandleState === undefined ? undefined : parsed.HandleState === 2;
  return {
    handleState:
      parsed.HandleState === undefined ? undefined : (HANDLE_STATES[parsed.HandleState] ?? null),
    brushingState: running === undefined ? undefined : running ? 'on' : 'off',
    routineIds: parsed.RoutineIDs,
    handleClock: parsed.HandleTime,
  };
}

function routineDelta(props: unknown): BrushDelta {
  const parsed = ROUTINE_PORT.parse(props);
  return {
    sessionId: parsed.SessionID,
    modePosition: parsed.Mode,
    elapsedS: parsed.Duration,
    routineS: parsed.Length,
    intensity: parsed.Intensity,
  };
}

function batteryDelta(props: unknown): BrushDelta {
  const parsed = BATTERY_PORT.parse(props);
  return { battery: parsed.BatteryPercent, batteryMillivolts: parsed.BatteryMV };
}

function headSerialOf(serial: readonly number[] | undefined): string | undefined {
  if (serial === undefined || serial.every((byte) => byte === 0)) {
    return undefined;
  }
  return serial.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

function headDelta(props: unknown): BrushDelta {
  const parsed = HEAD_PORT.parse(props);
  return {
    headSerial: headSerialOf(parsed.SerialNumber),
    headLimitS: parsed.LifetimeLimit,
    headUsageS: parsed.LifetimeUsage,
    headRing: parsed.RingId,
    nfcVersion: parsed.NfcTagVersion?.join('.'),
  };
}

function storageDelta(props: unknown): BrushDelta {
  const parsed = STORAGE_PORT.parse(props);
  return { latestStoredId: parsed.LatestID, storedCount: parsed.Count };
}

function diagnosticsDelta(props: unknown): BrushDelta {
  const parsed = DIAGNOSTICS_PORT.parse(props);
  return { errorPersistent: parsed.PErrors, errorVolatile: parsed.VErrors };
}

function extendedDelta(props: unknown): BrushDelta {
  return { settingsBits: EXTENDED_PORT.parse(props).FeatureCtrl };
}

function sensorsDelta(props: unknown): BrushDelta {
  return { sensorMask: SENSOR_PORT_PROPS.parse(props).Sensors };
}

function firmwareDelta(props: unknown): BrushDelta {
  const parsed = FIRMWARE_PORT.parse(props);
  return { model: parsed.name, firmware: parsed.version };
}

const PORT_DELTAS: ReadonlyMap<string, (props: unknown) => BrushDelta> = new Map([
  ['Sonicare', sonicareDelta],
  ['RoutineStatus', routineDelta],
  ['Battery', batteryDelta],
  ['BrushHead', headDelta],
  ['SessionStorage', storageDelta],
  ['Diagnostics', diagnosticsDelta],
  ['Extended', extendedDelta],
  ['SensorData', sensorsDelta],
  ['firmware', firmwareDelta],
]);

export function portDelta(port: string, props: unknown): BrushDelta {
  if (props === null) {
    return {};
  }
  return PORT_DELTAS.get(port)?.(props) ?? {};
}

const PORT_SIGNATURES: readonly (readonly [string, readonly string[]])[] = [
  ['Sonicare', ['HandleState', 'RoutineIDs']],
  ['RoutineStatus', ['SessionID', 'Duration', 'Mode', 'Length']],
  ['Battery', ['BatteryPercent', 'BatteryMV']],
  ['BrushHead', ['SerialNumber', 'LifetimeLimit', 'LifetimeUsage']],
  ['SessionStorage', ['LatestID', 'Count']],
  ['Diagnostics', ['PErrors', 'VErrors']],
  ['Extended', ['FeatureCtrl']],
  ['SensorData', ['Sensors', 'Types']],
  ['firmware', ['canupgrade', 'maxchunksize']],
];

export function portOfProps(props: unknown): string | null {
  if (typeof props !== 'object' || props === null) {
    return null;
  }
  const names = Object.keys(props);
  return PORT_SIGNATURES.find(([, keys]) => keys.some((key) => names.includes(key)))?.[0] ?? null;
}

export function sensorDelta(body: Uint8Array): BrushDelta {
  return decodeSensorFrame(body);
}
