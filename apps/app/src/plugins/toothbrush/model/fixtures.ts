import {
  BRUSHING_SESSION,
  ORALB_CHARACTERISTICS,
  ORALB_IDENTITY,
  SONICARE_IDENTITY,
  BRUSH_LIVE_FRAME,
  BRUSH_STATE_VIEW,
  oralbProfileOf,
  sonicareProfileOf,
  type BrushLiveFrame,
  type BrushStateView,
  type BrushingSession,
} from '@smarteverything/domain';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

const IDENTITY = SONICARE_IDENTITY.parse({
  model: 'HX992X',
  serial: '0143C5C968',
  firmware: '2.15.1 0.6.1.0',
  manufacturer: 'Philips OHC',
  pnp: null,
  stack: 'classic',
  bonded: false,
  address: '24:E5:AA:00:00:03',
  gapName: 'Philips Sonicare',
  services: [],
  ports: [],
  routineIds: [0, 1, 2, 4],
  clockIsUnix: true,
});

export function frameOf(input: Partial<BrushLiveFrame> = {}): BrushLiveFrame {
  return BRUSH_LIVE_FRAME.parse({
    at: '2026-10-18T07:30:00.000Z',
    activity: 'standby',
    session: 'idle',
    link: 'linked',
    mode: 'clean',
    intensity: 'medium',
    elapsedS: 0,
    routineS: 120,
    zone: null,
    battery: 80,
    detailVisible: true,
    pressure: null,
    pressureValue: null,
    temperatureC: null,
    strip: [],
    excessS: 0,
    zoneSource: 'estimated',
    zoneSeconds: [],
    sectorS: null,
    force: null,
    angleDeg: null,
    face: null,
    liveSource: null,
    ...input,
  });
}

export function sessionOf(input: Partial<BrushingSession> = {}): BrushingSession {
  return BRUSHING_SESSION.parse({
    id: 'session-1',
    deviceId: DEVICE_ID,
    personId: null,
    handleSessionId: null,
    startedAt: '2026-10-18T06:45:00.000Z',
    zoneOffsetSeconds: 0,
    durationS: 120,
    routineS: 120,
    mode: 'clean',
    intensity: 'medium',
    source: 'observed',
    complete: true,
    pressure: null,
    zones: [],
    headSerial: null,
    ...input,
  });
}

export interface ViewInput {
  readonly frame?: Partial<BrushLiveFrame>;
  readonly view?: Partial<BrushStateView>;
  readonly link?: Partial<BrushStateView['link']>;
  readonly head?: Partial<BrushStateView['head']>;
  readonly battery?: Partial<BrushStateView['battery']>;
}

const LINK = {
  phase: 'linked',
  holderName: 'Pixel',
  holderIsYou: true,
  rssi: -58,
  lastHeardAt: '2026-10-18T07:29:00.000Z',
  detail: null,
  fetching: 0,
} as const;

const HEAD = {
  state: 'fitted',
  type: 'clean',
  usageS: 3600,
  limitS: 10800,
  wearPercent: 33,
  sessionsLeft: 60,
  replaceBy: null,
  madeOn: null,
  daysLeft: null,
  secondsLeft: null,
  reminder: null,
  baselineDays: null,
} as const;

const BATTERY = {
  percent: 80,
  millivolts: 3900,
  daysLeft: 9,
  low: false,
  charging: false,
} as const;

const HANDLE = {
  motorHours: 12,
  lifetimeSessions: 300,
  faultHex: null,
  clockIsUnix: true,
  firmware: '2.15.1',
  oralb: null,
} as const;

const TODAY = {
  day: '2026-10-18',
  sessions: 1,
  counted: 1,
  goalSessions: 2,
  seconds: 120,
  goalSeconds: 240,
  morning: true,
  evening: false,
  percent: 50,
} as const;

export function viewOf(input: ViewInput = {}): BrushStateView {
  return BRUSH_STATE_VIEW.parse({
    view: 'state',
    deviceId: DEVICE_ID,
    model: 'HX992X',
    family: 'classic_open',
    profile: sonicareProfileOf(IDENTITY),
    availableModes: ['clean', 'white_plus', 'gum_health', 'deep_clean_plus'],
    link: { ...LINK, ...input.link },
    frame: frameOf(input.frame),
    head: { ...HEAD, ...input.head },
    battery: { ...BATTERY, ...input.battery },
    handle: HANDLE,
    personId: 'person-1',
    personName: 'Sam',
    mine: true,
    today: TODAY,
    streak: 3,
    score: 72,
    lastSession: sessionOf(),
    writes: { allowed: false, reason: 'This model cannot be written to.' },
    mayConfigure: true,
    ...input.view,
  });
}

const ORALB = ORALB_IDENTITY.parse({
  address: 'A0:14:3D:11:22:33',
  advertAddress: 'A0:14:3D:11:22:33',
  protocol: 8,
  modelId: 0x36,
  firmware: 82,
  gapName: 'Oral-B Toothbrush',
  services: [],
  present: [...ORALB_CHARACTERISTICS],
  ff05Length: 8,
  ff05Runtime: null,
  ff0bLength: 10,
  ff2bLength: 4,
  ff2dLength: 5,
  advertHex: '08365208320000050001',
  clock: 1_790_000_000,
});

export const ORALB_PROFILE_FIXTURE = oralbProfileOf(ORALB, [30, 30, 30, 30, 0, 0, 0, 0]);

const ORALB_HEAD = {
  state: 'fitted',
  type: null,
  usageS: null,
  limitS: null,
  wearPercent: null,
  sessionsLeft: null,
  replaceBy: null,
  madeOn: null,
  daysLeft: 70,
  secondsLeft: null,
  reminder: null,
  baselineDays: 90,
} as const;

const ORALB_HANDLE = {
  motorHours: null,
  lifetimeSessions: null,
  faultHex: null,
  clockIsUnix: null,
  firmware: null,
  oralb: {
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    ringColour: 'white',
    ringDisplay: [255, 255, 255],
    modeSlots: ['daily_clean', 'sensitive', 'gum_care', 'whiten', 'intense'],
    pacer: [30, 30, 30, 30, 0, 0, 0, 0],
    chargeCycles: null,
    brushingCycles: null,
    motorSeconds: null,
  },
} as const;

export function oralbFrameOf(input: Partial<BrushLiveFrame> = {}): BrushLiveFrame {
  return frameOf({
    mode: 'daily_clean',
    intensity: null,
    zoneSource: 'pacer',
    liveSource: 'link',
    ...input,
  });
}

export function oralbSessionOf(input: Partial<BrushingSession> = {}): BrushingSession {
  return sessionOf({
    mode: 'daily_clean',
    intensity: null,
    zones: [30, 30, 18, 0],
    details: { zoneSource: 'pacer', face: 5, batteryEnd: 70, handleUser: 0, sectors: 4 },
    ...input,
  });
}

export function oralbViewOf(input: ViewInput = {}): BrushStateView {
  return BRUSH_STATE_VIEW.parse({
    view: 'state',
    deviceId: DEVICE_ID,
    model: 'io9',
    family: null,
    profile: ORALB_PROFILE_FIXTURE,
    availableModes: ['daily_clean', 'sensitive', 'gum_care', 'whiten', 'intense'],
    link: { ...LINK, ...input.link },
    frame: oralbFrameOf(input.frame),
    head: { ...ORALB_HEAD, ...input.head },
    battery: { ...BATTERY, ...input.battery },
    handle: ORALB_HANDLE,
    personId: 'person-1',
    personName: 'Sam',
    mine: true,
    today: TODAY,
    streak: 3,
    score: 72,
    lastSession: oralbSessionOf(),
    writes: { allowed: false, reason: 'Changing the brush is off.' },
    mayConfigure: true,
    ...input.view,
  });
}
