import type { TreadmillStateView } from '@smarteverything/domain';

export interface FixtureInput {
  readonly phase?: TreadmillStateView['link']['phase'];
  readonly holderIsYou?: boolean;
  readonly holderName?: string | null;
  readonly state?: TreadmillStateView['frame']['belt']['state'];
  readonly speedKmh?: number;
  readonly fault?: TreadmillStateView['fault'];
  readonly controlLost?: boolean;
  readonly childLock?: boolean;
  readonly allowed?: boolean;
  readonly reason?: string | null;
  readonly cap?: number | null;
  readonly remoteCap?: number | null;
  readonly bodyVisible?: boolean;
}

const DEFAULTS: Required<FixtureInput> = {
  phase: 'linked',
  holderIsYou: true,
  holderName: 'Pixel',
  state: 'idle',
  speedKmh: 0,
  fault: null,
  controlLost: false,
  childLock: false,
  allowed: true,
  reason: null,
  cap: null,
  remoteCap: null,
  bodyVisible: true,
};

function linkOf(input: Required<FixtureInput>): TreadmillStateView['link'] {
  return {
    phase: input.phase,
    holderName: input.holderName,
    holderIsYou: input.holderIsYou,
    rssi: -58,
    reconnects: 0,
    lastHeardAt: null,
    detail: null,
    walkerProfileId: null,
    walkerName: null,
  };
}

function frameOf(input: Required<FixtureInput>): TreadmillStateView['frame'] {
  return {
    at: '2026-10-18T10:00:00.000Z',
    belt: {
      state: input.state,
      mode: 'manual',
      speedKmh: input.speedKmh,
      targetSpeedKmh: null,
      timeS: 0,
      distanceM: 0,
      steps: null,
      cadence: null,
      inclinePercent: null,
      inclineTarget: null,
      inclineGrade: null,
      inclineScale: 'unconfirmed',
      button: null,
      childLock: input.childLock,
      controlLost: input.controlLost,
      link: input.phase,
    },
    session: null,
    body: null,
  };
}

export function stateViewFixture(given: FixtureInput): TreadmillStateView {
  const input: Required<FixtureInput> = { ...DEFAULTS, ...given };
  return {
    view: 'state',
    deviceId: '00000000-0000-4000-8000-000000000001',
    family: 'wilink',
    model: 'kingsmith.treadmill.k15',
    link: linkOf(input),
    frame: frameOf(input),
    recentSpeed: [],
    limits: {
      minKmh: 0.8,
      maxKmh: 15,
      stepKmh: 0.1,
      capKmh: input.cap,
      remoteCapKmh: input.remoteCap,
      incline: null,
    },
    pad: input.childLock ? { childLock: true } : {},
    fault: input.fault,
    lastSession: null,
    start: { allowed: input.allowed, reason: input.reason },
    mayConfigure: true,
    inclineScale: 'unconfirmed',
    bodyVisible: input.bodyVisible,
    maintenance: { lubricatedAt: null, dueInDays: 80, beltKmSince: 0 },
  };
}
