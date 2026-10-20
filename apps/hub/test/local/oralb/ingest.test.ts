import { afterEach, describe, expect, it } from 'vitest';
import { entrySettingsOf, oralbSettingsOf } from '../../../src/local/oralb/config';
import {
  headerHex,
  identityOf,
  lastState,
  long,
  oralbRig,
  pressureHex,
  recordHex,
  word,
  bytes,
  type AdvertSpec,
  type OralbRig,
} from './rig';

let rig: OralbRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

async function open(options: Parameters<typeof oralbRig>[0] = {}): Promise<OralbRig> {
  rig = await oralbRig(options);
  return rig;
}

function sectorOf(second: number): { sector: number; secondsInSector: number } {
  const sector = Math.min(4, 1 + Math.floor((second - 1) / 30));
  return { sector, secondsInSector: second - 30 * (sector - 1) };
}

function brushByAdvert(
  brushed: OralbRig,
  input: { from: number; seconds: number; high?: readonly number[]; protocol?: number },
): void {
  for (let second = 1; second <= input.seconds; second += 1) {
    const spec: AdvertSpec = {
      state: 3,
      timerS: second,
      mode: 0,
      high: input.high?.includes(second) ?? false,
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...sectorOf(second),
    };
    brushed.batch(input.from + second, { adverts: [brushed.advert(input.from + second, spec)] });
  }
}

function summary(brushed: OralbRig, seconds: number, face = 5, protocol?: number): void {
  brushed.batch(seconds, {
    adverts: [
      brushed.advert(seconds, {
        state: 9,
        timerS: 120,
        face,
        sector: 7,
        ...(protocol === undefined ? {} : { protocol }),
      }),
    ],
  });
}

describe('a brush that goes quiet while brushing', () => {
  it('ends the session once nothing is heard for the silence window', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2 })] });
    brushByAdvert(brushed, { from: 0, seconds: 40 });
    expect(lastState(brushed, 'brush_session')).toBe('running');
    brushed.clock.advanceTo(brushed.at(40 + 29));
    expect(lastState(brushed, 'brush_session')).toBe('running');
    brushed.clock.advanceTo(brushed.at(40 + 31));
    expect(lastState(brushed, 'brush_session')).toBe('stopped_early');
    expect(lastState(brushed, 'brush_activity')).toBe('asleep');
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({ complete: false, durationS: 40 });
  });
});

describe('adverts heard without a connection', () => {
  it('turns a standing brush into capabilities', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2, mode: 1 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('standby');
    expect(lastState(brushed, 'brush_mode')).toBe('sensitive');
    expect(lastState(brushed, 'brush_session')).toBe('idle');
  });

  it('keeps a brushed session with the real seconds in each quadrant and the result face', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2 })] });
    brushByAdvert(brushed, {
      from: 0,
      seconds: 120,
      high: [50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
    });
    expect(lastState(brushed, 'brush_activity')).toBe('brushing');
    expect(lastState(brushed, 'brush_session')).toBe('running');
    summary(brushed, 122);
    expect(lastState(brushed, 'brush_session')).toBe('completed');
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({
      mode: 'daily_clean',
      durationS: 120,
      complete: true,
      source: 'observed',
      zones: [30, 30, 30, 30],
      details: { zoneSource: 'pacer', face: 5, sectors: 4 },
      pressure: { excessS: 10, highEvents: 1 },
    });
    expect(brushed.events).toHaveLength(1);
    expect(brushed.events[0]).toMatchObject({
      kind: 'activity',
      details: { brushing: 'finished', complete: true, mode: 'daily_clean', durationS: 120 },
    });
  });

  it('marks a session that ended before the routine as stopped early', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2 })] });
    brushByAdvert(brushed, { from: 0, seconds: 40 });
    brushed.batch(41, { adverts: [brushed.advert(41, { state: 9, timerS: 40, face: 2 })] });
    expect(lastState(brushed, 'brush_session')).toBe('stopped_early');
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({ complete: false, durationS: 40 });
  });

  it('reads a session in the selection menu as brushing only while the timer advances', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 8, timerS: 0 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('standby');
    brushed.batch(1, { adverts: [brushed.advert(1, { state: 8, timerS: 1 })] });
    brushed.batch(2, { adverts: [brushed.advert(2, { state: 8, timerS: 2 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('brushing');
    brushed.batch(30, { adverts: [brushed.advert(30, { state: 8, timerS: 2 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('standby');
  });

  it('maps sleeping, transport and charging states', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 4 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('charging');
    brushed.batch(1, { adverts: [brushed.advert(1, { state: 115 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('asleep');
    brushed.batch(2, { adverts: [brushed.advert(2, { state: 116 })] });
    expect(lastState(brushed, 'brush_activity')).toBe('off');
  });

  it('reports an advert of an old protocol as unreadable and changes nothing', async () => {
    const brushed = await open();
    brushed.batch(0, {
      adverts: [{ at: brushed.at(0), rssi: -60, hex: '0201080220000001010004' }],
    });
    expect(lastState(brushed, 'brush_activity')).toBeUndefined();
  });
});

describe('pausing', () => {
  it('resumes the same session when the brush runs again within the grace', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2 })] });
    brushByAdvert(brushed, { from: 0, seconds: 40 });
    brushed.batch(41, { adverts: [brushed.advert(41, { state: 2, timerS: 40 })] });
    expect(lastState(brushed, 'brush_session')).toBe('paused');
    brushed.batch(45, {
      adverts: [brushed.advert(45, { state: 3, timerS: 41, sector: 2, secondsInSector: 11 })],
    });
    expect(lastState(brushed, 'brush_session')).toBe('running');
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
    brushed.batch(46, { adverts: [brushed.advert(46, { state: 9, timerS: 41, face: 3 })] });
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(1);
  });

  it('closes the session by the deadline when nothing is heard after the stop', async () => {
    const brushed = await open();
    brushed.batch(0, { adverts: [brushed.advert(0, { state: 2 })] });
    brushByAdvert(brushed, { from: 0, seconds: 40 });
    brushed.batch(41, { adverts: [brushed.advert(41, { state: 2, timerS: 40 })] });
    expect(brushed.clock.pending()).toEqual([brushed.at(61)]);
    brushed.clock.advanceTo(brushed.at(62));
    expect(lastState(brushed, 'brush_session')).toBe('stopped_early');
    const sessions = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ durationS: 40, complete: false });
  });
});

describe('a connected brush', () => {
  it('learns the force bands at the end of a session and keeps them', async () => {
    const brushed = await open();
    brushed.batch(0, {
      phase: 'linked',
      frames: [brushed.frame('ff04', bytes(2, 0), 0), brushed.frame('ff26', '1e1e1e1e00000000', 0)],
    });
    brushed.batch(1, { phase: 'linked', frames: [brushed.frame('ff04', bytes(3, 0), 1)] });
    for (let second = 1; second <= 30; second += 1) {
      const low = second >= 5 && second <= 7;
      const high = second >= 10 && second <= 12;
      const pressure = low ? 0 : high ? 2 : 1;
      const force = low ? 400 + second * 20 : high ? 3000 + (second - 10) * 100 : 2000;
      brushed.batch(1 + second, {
        phase: 'linked',
        frames: [
          brushed.frame('ff08', bytes(0, second), 1 + second),
          brushed.frame('ff0b', pressureHex(pressure, force), 1 + second),
        ],
      });
    }
    brushed.batch(33, { phase: 'linked', frames: [brushed.frame('ff04', bytes(9, 0), 33)] });
    expect(
      oralbSettingsOf(brushed.test.store.localDevices.byExternalId(brushed.device.external_id))
        .forceBands,
    ).toEqual({
      lightBelow: 0.54,
      highAbove: 3,
      samples: 1,
    });
    expect(brushed.entry().schedule).toEqual([30, 30, 30, 30, 0, 0, 0, 0]);
  });

  it('shows the live force and angle only to the person who brushes', async () => {
    const brushed = await open();
    brushed.watched.value = true;
    brushed.batch(0, {
      phase: 'linked',
      frames: [brushed.frame('ff04', bytes(3, 0), 0), brushed.frame('ff08', bytes(0, 5), 0)],
    });
    brushed.batch(1, {
      phase: 'linked',
      frames: [brushed.frame('ff0b', pressureHex(1, 2500, 2800), 1)],
    });
    const last = brushed.notices.at(-1);
    expect(last?.notices[0]?.frame).toMatchObject({ force: 2.5, angleDeg: 28, liveSource: 'link' });
    expect(last?.notices[1]?.frame).toMatchObject({
      force: null,
      angleDeg: null,
      detailVisible: false,
    });
  });
});

describe('the brush head', () => {
  function reading(days: number, seconds: number): string {
    return `${bytes(0)}${word(days)}${word(seconds)}`;
  }

  it('counts from the first reading, warns once and detects a replaced head', async () => {
    const brushed = await open();
    brushed.batch(0, { phase: 'linked', frames: [brushed.frame('ff2d', reading(30, 600), 0)] });
    expect(
      oralbSettingsOf(brushed.test.store.localDevices.byExternalId(brushed.device.external_id))
        .headBaseline,
    ).toMatchObject({ days: 30, seconds: 600 });
    expect(lastState(brushed, 'brush_head_days_left')).toBe(30);
    expect(lastState(brushed, 'brush_head_wear')).toBe(0);
    brushed.batch(10, { phase: 'linked', frames: [brushed.frame('ff2d', reading(20, 400), 10)] });
    expect(lastState(brushed, 'brush_head_wear')).toBe(33);
    brushed.batch(20, { phase: 'linked', frames: [brushed.frame('ff2d', reading(13, 300), 20)] });
    brushed.batch(21, { phase: 'linked', frames: [brushed.frame('ff2d', reading(12, 290), 21)] });
    const warnings = brushed.events.filter((event) => event.details['brushHead'] === 'warn');
    expect(warnings).toHaveLength(1);
    brushed.batch(30, { phase: 'linked', frames: [brushed.frame('ff2d', reading(90, 1800), 30)] });
    expect(
      brushed.events.filter((event) => event.details['brushHead'] === 'replaced'),
    ).toHaveLength(1);
    expect(
      oralbSettingsOf(brushed.test.store.localDevices.byExternalId(brushed.device.external_id))
        .headBaseline,
    ).toMatchObject({ days: 90, seconds: 1800 });
    expect(lastState(brushed, 'brush_head_wear')).toBe(0);
    expect(lastState(brushed, 'brush_head_reminder')).toBe('on');
  });
});

describe('the brush own record', () => {
  const CLOCK = 838_854_030;

  async function brushed(protocol: 6 | 8): Promise<OralbRig> {
    const current = await open({ identity: identityOf({ protocol }) });
    current.batch(0, { adverts: [current.advert(0, { state: 2, protocol })] });
    brushByAdvert(current, { from: 0, seconds: 120, protocol });
    summary(current, 122, 5, protocol);
    return current;
  }

  it('refines the session heard from adverts with the record of a protocol 8 brush', async () => {
    const current = await brushed(8);
    current.batch(200, {
      phase: 'linked',
      frames: [
        current.frame('ff22', long(CLOCK), 200),
        current.frame(
          'ff29',
          recordHex({
            startClock: CLOCK - 200,
            sessionId: 353,
            duration: 123,
            highDs: 100,
            lowDs: 10,
            avg: 19,
            max: 33,
            highEvents: 4,
            lowEvents: 2,
            battery: 94,
          }),
          200,
        ),
      ],
    });
    const sessions = current.test.store.brushingSessions.all(current.device.id, undefined);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      handleSessionId: 353,
      source: 'retained',
      durationS: 123,
      zones: [30, 30, 30, 30],
      details: { batteryEnd: 94, face: 5, sectors: 4, handleUser: 0 },
      pressure: {
        excessS: 10,
        lowS: 1,
        highEvents: 4,
        lowEvents: 2,
        forceAvgN: 1.9,
        forceMaxN: 3.3,
      },
    });
    expect(sessions[0]?.pressure?.strip).toHaveLength(120);
    expect(current.events).toHaveLength(1);
  });

  it('merges the header of a protocol 6 brush into the session heard from adverts', async () => {
    const current = await brushed(6);
    current.batch(200, {
      phase: 'linked',
      frames: [
        current.frame('ff22', long(CLOCK), 200),
        current.frame('ff29', headerHex({ startClock: CLOCK - 200, sessionId: 1023 }), 200),
      ],
    });
    const sessions = current.test.store.brushingSessions.all(current.device.id, undefined);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      handleSessionId: 1023,
      source: 'retained',
      durationS: 120,
    });
    expect(
      oralbSettingsOf(current.test.store.localDevices.byExternalId(current.device.external_id))
        .missed,
    ).toEqual([]);
    current.batch(260, {
      phase: 'linked',
      frames: [
        current.frame('ff22', long(CLOCK + 60), 260),
        current.frame('ff29', headerHex({ startClock: CLOCK - 200, sessionId: 1023 }), 260),
      ],
    });
    expect(current.test.store.brushingSessions.all(current.device.id, undefined)).toHaveLength(1);
  });

  it('lists a protocol 6 header with no heard session as missed and never invents a session', async () => {
    const current = await brushed(6);
    current.batch(5000, {
      phase: 'linked',
      frames: [
        current.frame('ff22', long(CLOCK), 5000),
        current.frame('ff29', headerHex({ startClock: CLOCK - 4000, sessionId: 1024 }), 5000),
      ],
    });
    expect(current.test.store.brushingSessions.all(current.device.id, undefined)).toHaveLength(1);
    const { missed } = oralbSettingsOf(
      current.test.store.localDevices.byExternalId(current.device.external_id),
    );
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ handleSessionId: 1024 });
    expect(
      entrySettingsOf(current.test.store.localDevices.byExternalId(current.device.external_id))
        .oralb?.missed,
    ).toHaveLength(1);
  });

  it('keeps a protocol 8 record the brush made while the phone was away as its own session', async () => {
    const current = await open();
    current.batch(0, {
      phase: 'linked',
      frames: [
        current.frame('ff22', long(CLOCK), 0),
        current.frame(
          'ff29',
          recordHex({ startClock: CLOCK - 30_000, sessionId: 12, duration: 118, avg: 10, max: 20 }),
          0,
        ),
      ],
    });
    const [session] = current.test.store.brushingSessions.all(current.device.id, undefined);
    expect(session).toMatchObject({
      handleSessionId: 12,
      source: 'retained',
      durationS: 118,
      zones: [],
      complete: false,
    });
  });
});
