import { CLASSIC_SERVICE, CONDOR_SERVICE } from '@smarteverything/domain';

export const PHILIPS_BASE = '477ea600-a260-11e4-ae37-0002a5d5';

const SIG_SUFFIX = '-0000-1000-8000-00805f9b34fb';

export function philips(id: string): string {
  return `${PHILIPS_BASE}${id}`;
}

export function shortOf(uuid: string): string {
  const lower = uuid.toLowerCase();
  if (lower.startsWith(PHILIPS_BASE) && lower.length === PHILIPS_BASE.length + 4) {
    return lower.slice(PHILIPS_BASE.length);
  }
  if (lower.startsWith('0000') && lower.endsWith(SIG_SUFFIX)) {
    return lower.slice(4, 8);
  }
  return lower;
}

export function fullOf(key: string): string {
  if (key.length === 4 && /^[0-9a-f]{4}$/.test(key)) {
    return key.startsWith('4') ? philips(key) : `0000${key}${SIG_SUFFIX}`;
  }
  return key;
}

export const SERVICE = {
  battery: '180f',
  deviceInformation: '180a',
  sonicare: CLASSIC_SERVICE,
  routine: philips('0002'),
  kidsSession: philips('0003'),
  storage: philips('0004'),
  sensor: philips('0005'),
  head: philips('0006'),
  diagnostic: philips('0007'),
  extended: philips('0008'),
  condor: CONDOR_SERVICE,
} as const;

export const CONDOR = {
  rx: 'e50b0001-af04-4564-92ad-fef019489de6',
  rxAck: 'e50b0002-af04-4564-92ad-fef019489de6',
  tx: 'e50b0003-af04-4564-92ad-fef019489de6',
  txAck: 'e50b0004-af04-4564-92ad-fef019489de6',
  serverConfig: 'e50b0006-af04-4564-92ad-fef019489de6',
  clientConfig: 'e50b0007-af04-4564-92ad-fef019489de6',
} as const;

export const KEY = {
  battery: '2a19',
  model: '2a24',
  serial: '2a25',
  firmware: '2a26',
  hardware: '2a27',
  software: '2a28',
  manufacturer: '2a29',
  pnp: '2a50',
  handleState: '4010',
  availableRoutines: '4020',
  routineIds: '4022',
  motorRuntime: '4040',
  handleClock: '4050',
  sessionId: '4070',
  mode: '4080',
  brushingState: '4082',
  elapsed: '4090',
  routineLength: '4091',
  pacer: '40a0',
  intensity: '40b0',
  easyStart: '40c0',
  latestStored: '40d0',
  storedCount: '40d2',
  recordKind: '40d5',
  fetchSession: '40e0',
  recordData: '4100',
  recordControl: '4110',
  sensorEnable: '4120',
  sensorData: '4130',
  headNfcVersion: '4210',
  headType: '4220',
  headSerial: '4230',
  headMade: '4240',
  headLimit: '4280',
  headUsage: '4290',
  headUrl: '42b0',
  headRing: '42c0',
  errorPersistent: '4310',
  errorVolatile: '4320',
  calibrationWords: '4330',
  batteryMillivolts: '4360',
  calibrationText: '4370',
  settings: '4420',
} as const;

const DEVICE_INFORMATION_KEYS: readonly string[] = [
  KEY.model,
  KEY.serial,
  KEY.firmware,
  KEY.hardware,
  KEY.software,
  KEY.manufacturer,
  KEY.pnp,
  '2a23',
  '2a2a',
];

const SERVICE_PREFIXES: readonly (readonly [string, string])[] = [
  ['40', SERVICE.sonicare],
  ['42', SERVICE.head],
  ['43', SERVICE.diagnostic],
  ['44', SERVICE.extended],
  ['41', SERVICE.sensor],
];

const ROUTINE_KEYS = [
  KEY.sessionId,
  KEY.mode,
  KEY.brushingState,
  KEY.elapsed,
  KEY.routineLength,
  KEY.pacer,
  KEY.intensity,
  KEY.easyStart,
] as const;

const STORAGE_KEYS: ReadonlySet<string> = new Set([
  KEY.latestStored,
  KEY.storedCount,
  KEY.recordKind,
  KEY.fetchSession,
  KEY.recordData,
  '40f0',
  KEY.recordControl,
]);

const SENSOR_KEYS = [KEY.sensorEnable, KEY.sensorData, '4140'] as const;

function keysOf(keys: readonly string[], service: string): [string, string][] {
  return keys.map((key) => [key, service]);
}

const FIXED_SERVICES: ReadonlyMap<string, string> = new Map([
  [KEY.battery, fullOf(SERVICE.battery)],
  ...DEVICE_INFORMATION_KEYS.map((key): [string, string] => [
    key,
    fullOf(SERVICE.deviceInformation),
  ]),
  ...keysOf(ROUTINE_KEYS, SERVICE.routine),
  ...keysOf(SENSOR_KEYS, SERVICE.sensor),
]);

export function classicServiceOf(key: string, kids: boolean): string | null {
  const fixed = FIXED_SERVICES.get(key);
  if (fixed !== undefined) {
    return fixed;
  }
  if (STORAGE_KEYS.has(key)) {
    return kids ? SERVICE.kidsSession : SERVICE.storage;
  }
  return SERVICE_PREFIXES.find(([start]) => key.length === 4 && key.startsWith(start))?.[1] ?? null;
}

export const BRUSH_SCAN_SERVICES = [CLASSIC_SERVICE, CONDOR_SERVICE] as const;

export const BRUSH_SCAN_NAME_PREFIXES = [
  'Philips Sonicare',
  'Philips OHC',
  'Sonicare4Kids',
] as const;

export const BRUSH_SCAN_MANUFACTURER = { companyId: 477, text: 'Condor' } as const;
