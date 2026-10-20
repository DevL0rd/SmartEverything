import { afterEach, describe, expect, it } from 'vitest';
import { lastState, sonicareRig, word, type SonicareRig } from '../../support/sonicare-rig';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

async function open(): Promise<SonicareRig> {
  rig = await sonicareRig();
  return rig;
}

function wake(brush: SonicareRig, seconds: number): ReturnType<SonicareRig['batch']> {
  return brush.batch(seconds, [
    brush.frame('2a19', '50', seconds),
    brush.frame('4022', '00010204', seconds),
    brush.frame('4080', '01', seconds),
    brush.frame('40b0', '01', seconds),
    brush.frame('4091', word(120), seconds),
    brush.frame('4070', word(485), seconds),
    brush.frame('4010', '01', seconds),
    brush.frame('4082', '00', seconds),
    brush.frame('4090', word(0), seconds),
  ]);
}

function brush(
  rigged: SonicareRig,
  from: number,
  seconds: number,
  pressure?: (second: number) => string,
): void {
  for (let second = from; second < from + seconds; second += 1) {
    const frames = [rigged.frame('4090', word(second - from), second)];
    if (pressure !== undefined) {
      frames.push(rigged.frame('4130', pressure(second - from), second));
    }
    rigged.batch(second, frames);
  }
}

function start(rigged: SonicareRig, seconds: number): void {
  rigged.batch(seconds, [
    rigged.frame('4010', '02', seconds),
    rigged.frame('4082', '01', seconds),
    rigged.frame('4090', word(0), seconds),
  ]);
}

describe('a handle that wakes up', () => {
  it('publishes the first reads as capabilities', async () => {
    const brushed = await open();
    wake(brushed, 0);
    expect(lastState(brushed, 'battery')).toBe(0x50);
    expect(lastState(brushed, 'brush_mode')).toBe('white_plus');
    expect(lastState(brushed, 'brush_intensity')).toBe('medium');
    expect(lastState(brushed, 'brush_routine_seconds')).toBe(120);
    expect(lastState(brushed, 'brush_activity')).toBe('standby');
    expect(lastState(brushed, 'brush_session')).toBe('idle');
    expect(lastState(brushed, 'brush_link')).toBe('linked');
    expect(brushed.pushed).toContainEqual({ capability: 'battery', value: 0x50 });
  });

  it('does not repeat a value that did not change', async () => {
    const brushed = await open();
    wake(brushed, 0);
    const before = brushed.states.length;
    wake(brushed, 1);
    expect(brushed.states.slice(before).filter((u) => u.capability === 'battery')).toHaveLength(0);
  });

  it('reports the Bluetooth link of the handle in the device details', async () => {
    const brushed = await open();
    wake(brushed, 0);
    expect(brushed.observed.at(-1)).toMatchObject({
      linkPhase: 'linked',
      lastHeardAt: brushed.at(0),
    });
  });
});

describe('a whole brushing session', () => {
  it('stores one session with the pressure strip, the zones and the mode, and says it finished', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    expect(lastState(brushed, 'brush_activity')).toBe('brushing');
    expect(lastState(brushed, 'brush_session')).toBe('running');
    brush(brushed, 10, 121, (second) =>
      second >= 60 && second < 70 ? '0100010002' : '0100010001',
    );
    brushed.batch(131, [
      brushed.frame('4082', '03', 131),
      brushed.frame('4090', word(120), 131),
      brushed.frame('4010', '01', 131),
    ]);
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({
      durationS: 120,
      routineS: 120,
      mode: 'white_plus',
      intensity: 'medium',
      complete: true,
      source: 'observed',
      handleSessionId: 485,
      personId: brushed.owner.profile.id,
    });
    expect(session?.zones).toStrictEqual([20, 40, 20, 20, 40, 20].map((value) => value * 0.75));
    expect(session?.pressure?.strip).toHaveLength(120);
    expect(session?.pressure?.excessS).toBe(10);
    expect(lastState(brushed, 'brush_session')).toBe('completed');
    const finished = brushed.events.filter((event) => event.kind === 'activity');
    expect(finished).toHaveLength(1);
    expect(finished[0]?.details).toMatchObject({
      brushing: 'finished',
      complete: true,
      durationS: 120,
    });
  });

  it('keeps a stopped session as short and not complete', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    brush(brushed, 10, 46);
    brushed.batch(56, [brushed.frame('4082', '04', 56), brushed.frame('4010', '01', 56)]);
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({ durationS: 45, complete: false });
    expect(lastState(brushed, 'brush_session')).toBe('stopped_early');
    expect(brushed.events.find((event) => event.kind === 'activity')?.details).toMatchObject({
      complete: false,
    });
  });

  it('throws away a session shorter than ten seconds', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    brush(brushed, 10, 5);
    brushed.batch(20, [brushed.frame('4010', '01', 20), brushed.frame('4082', '00', 20)]);
    expect(brushed.test.store.brushingSessions.all(brushed.device.id, undefined)).toHaveLength(0);
    expect(brushed.events.filter((event) => event.kind === 'activity')).toHaveLength(0);
  });

  it('follows pause and resume', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    brush(brushed, 10, 30);
    brushed.batch(41, [brushed.frame('4082', '02', 41)]);
    expect(lastState(brushed, 'brush_session')).toBe('paused');
    expect(lastState(brushed, 'brush_activity')).toBe('paused');
    brushed.batch(50, [brushed.frame('4082', '01', 50)]);
    expect(lastState(brushed, 'brush_session')).toBe('running');
  });

  it('keeps what a link that dropped mid session had seen', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    brush(brushed, 10, 41);
    brushed.batch(60, [], 'asleep');
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session).toMatchObject({ durationS: 40, complete: false });
    expect(lastState(brushed, 'brush_activity')).toBe('asleep');
    expect(lastState(brushed, 'brush_link')).toBe('asleep');
  });

  it('starts a session in the middle without inventing a pressure history', async () => {
    const brushed = await open();
    wake(brushed, 0);
    brushed.batch(70, [
      brushed.frame('4010', '02', 70),
      brushed.frame('4082', '01', 70),
      brushed.frame('4090', word(60), 70),
      brushed.frame('4130', '0100010001', 70),
    ]);
    brush(brushed, 130, 1);
    brushed.batch(131, [brushed.frame('4090', word(120), 131)]);
    brushed.batch(132, [brushed.frame('4082', '03', 132), brushed.frame('4010', '01', 132)]);
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    expect(session?.startedAt).toBe(brushed.at(10));
    expect(session?.pressure).toBeNull();
    expect(session?.complete).toBe(true);
  });
});

describe('pressure while brushing', () => {
  it('holds a pressure change for two seconds before saying it', async () => {
    const brushed = await open();
    wake(brushed, 0);
    start(brushed, 10);
    brushed.batch(11, [
      brushed.frame('4090', word(1), 11),
      brushed.frame('4130', '0100010001', 11),
    ]);
    expect(brushed.fleet.of(brushed.row()).runtime.pressureShown).toBe('optimal');
    brushed.batch(12, [brushed.frame('4130', '0100010002', 12)]);
    expect(brushed.fleet.of(brushed.row()).runtime.pressureShown).toBe('optimal');
    brushed.batch(13, [brushed.frame('4130', '0100010001', 13)]);
    expect(brushed.fleet.of(brushed.row()).runtime.pressureShown).toBe('optimal');
    brushed.batch(15, [brushed.frame('4130', '0100010002', 15)]);
    brushed.batch(18, [brushed.frame('4130', '0100010002', 18)]);
    expect(brushed.fleet.of(brushed.row()).runtime.pressureShown).toBe('too_high');
  });
});

describe('the brush head', () => {
  it('reports wear and sessions left, remembers the head and warns once at ninety percent', async () => {
    const brushed = await open();
    wake(brushed, 0);
    const serial = '04091c72b81b91';
    brushed.batch(1, [
      brushed.frame('4230', serial, 1),
      brushed.frame('4220', '05', 1),
      brushed.frame('4280', word(21600), 1),
      brushed.frame('4290', word(19440), 1),
    ]);
    expect(lastState(brushed, 'brush_head')).toBe('fitted');
    expect(lastState(brushed, 'brush_head_type')).toBe('sensitive');
    expect(lastState(brushed, 'brush_head_wear')).toBe(90);
    expect(lastState(brushed, 'brush_head_sessions_left')).toBe(18);
    expect(brushed.pushed).toContainEqual({ capability: 'brush_head_wear', value: 90 });
    expect(brushed.test.store.brushingSessions.heads(brushed.device.id)).toHaveLength(1);
    expect(brushed.events.filter((event) => event.kind === 'maintenance')).toMatchObject([
      { details: { brushHead: 'warn', wearPercent: 90 } },
    ]);
    brushed.batch(2, [brushed.frame('4290', word(19560), 2)]);
    expect(brushed.events.filter((event) => event.kind === 'maintenance')).toHaveLength(1);
    brushed.batch(3, [brushed.frame('4290', word(21600), 3)]);
    expect(
      brushed.events.filter((event) => event.kind === 'maintenance').at(-1)?.details,
    ).toMatchObject({
      brushHead: 'due',
    });
  });

  it('calls a head without a serial missing, and an unscanned one unrecognised after thirty seconds of brushing', async () => {
    const brushed = await open();
    wake(brushed, 0);
    brushed.batch(1, [brushed.frame('4230', '00000000000000', 1)]);
    expect(lastState(brushed, 'brush_head')).toBe('missing');
    start(brushed, 10);
    brush(brushed, 10, 40);
    brushed.batch(51, [
      brushed.frame('4230', '00000000000001', 51),
      brushed.frame('4230', '00000000000000', 51),
    ]);
    expect(lastState(brushed, 'brush_head')).toBe('unrecognised');
  });
});

describe('error bits', () => {
  it('treats the first reading as normal and a change as a fault', async () => {
    const brushed = await open();
    wake(brushed, 0);
    brushed.batch(1, [brushed.frame('4310', '00100000', 1), brushed.frame('4320', '00000000', 1)]);
    expect(brushed.observed.some((entry) => 'faultBaseline' in entry)).toBe(true);
    expect(lastState(brushed, 'brush_fault')).toBeUndefined();
    brushed.batch(2, [brushed.frame('4310', '00100000', 2)]);
    expect(lastState(brushed, 'brush_fault')).toBe(false);
    brushed.batch(3, [brushed.frame('4310', '01100000', 3)]);
    expect(lastState(brushed, 'brush_fault')).toBe(true);
    expect(brushed.events.filter((event) => event.kind === 'fault')).toMatchObject([
      { details: { brushFault: '1001:0' } },
    ]);
  });
});

describe('live viewers', () => {
  it('gives the owner the pressure detail and the member only the device level', async () => {
    const brushed = await open();
    brushed.watched.value = true;
    wake(brushed, 0);
    start(brushed, 10);
    brushed.batch(11, [
      brushed.frame('4090', word(1), 11),
      brushed.frame('4130', '0100010001', 11),
    ]);
    const last = brushed.notices.at(-1)?.notices;
    expect(last?.[0]?.frame).toMatchObject({
      detailVisible: true,
      session: 'running',
      elapsedS: 1,
    });
    expect(last?.[1]?.frame).toMatchObject({ detailVisible: false, strip: [], pressure: null });
    expect(last?.[1]?.frame.elapsedS).toBe(1);
  });
});
