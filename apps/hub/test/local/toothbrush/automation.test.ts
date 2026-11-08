import { signalMatchesMatcher, type JsonValue, type SignalInput } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import {
  TOOTHBRUSH_AUTOMATION,
  registerToothbrushAutomation,
} from '../../../src/local/toothbrush/automation';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import { eventSignal } from '../../../src/signals/sources/device';
import { trigger } from '../../support/automation-fixture';
import { sonicareRig, word, type SonicareRig } from '../../support/sonicare-rig';

const FINISHED = 'trigger.plugin.driver_toothbrush.brushing_finished';

const HEAD_DUE = 'trigger.plugin.driver_toothbrush.brush_head_due';

const HEAD_WEARING = 'trigger.plugin.driver_toothbrush.brush_head_wearing';

const OTHER_BRUSH = 'brush-2';

const BOTTLE = 'bottle-1';

const HEAD_SERIAL = '04091c72b81b91';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

async function open(): Promise<SonicareRig> {
  rig = await sonicareRig();
  return rig;
}

function wake(brushed: SonicareRig, seconds: number): void {
  brushed.batch(seconds, [
    brushed.frame('2a19', '50', seconds),
    brushed.frame('4022', '00010204', seconds),
    brushed.frame('4080', '01', seconds),
    brushed.frame('40b0', '01', seconds),
    brushed.frame('4091', word(120), seconds),
    brushed.frame('4070', word(485), seconds),
    brushed.frame('4010', '01', seconds),
    brushed.frame('4082', '00', seconds),
    brushed.frame('4090', word(0), seconds),
  ]);
}

function start(brushed: SonicareRig, seconds: number): void {
  brushed.batch(seconds, [
    brushed.frame('4010', '02', seconds),
    brushed.frame('4082', '01', seconds),
    brushed.frame('4090', word(0), seconds),
  ]);
}

function brush(
  brushed: SonicareRig,
  from: number,
  seconds: number,
  pressure?: (second: number) => string,
): void {
  for (let second = from; second < from + seconds; second += 1) {
    const frames = [brushed.frame('4090', word(second - from), second)];
    if (pressure !== undefined) {
      frames.push(brushed.frame('4130', pressure(second - from), second));
    }
    brushed.batch(second, frames);
  }
}

function brushedWhole(brushed: SonicareRig): void {
  wake(brushed, 0);
  start(brushed, 10);
  brush(brushed, 10, 121, (second) => (second >= 60 && second < 70 ? '0100010002' : '0100010001'));
  brushed.batch(131, [
    brushed.frame('4082', '03', 131),
    brushed.frame('4090', word(120), 131),
    brushed.frame('4010', '01', 131),
  ]);
}

function brushedStopped(brushed: SonicareRig): void {
  wake(brushed, 0);
  start(brushed, 10);
  brush(brushed, 10, 46, () => '0100010001');
  brushed.batch(56, [brushed.frame('4082', '04', 56), brushed.frame('4010', '01', 56)]);
}

function brushedWithoutPressure(brushed: SonicareRig): void {
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
}

function wornHead(brushed: SonicareRig): void {
  wake(brushed, 0);
  brushed.batch(1, [
    brushed.frame('4230', HEAD_SERIAL, 1),
    brushed.frame('4220', '05', 1),
    brushed.frame('4280', word(21600), 1),
    brushed.frame('4290', word(19440), 1),
  ]);
  brushed.batch(3, [brushed.frame('4290', word(21600), 3)]);
}

function signalsOf(brushed: SonicareRig, kind: 'activity' | 'maintenance'): SignalInput[] {
  return brushed.events
    .filter((event) => event.kind === kind)
    .map((event, index) =>
      eventSignal(
        {
          id: `event-${String(index)}`,
          deviceId: brushed.device.id,
          kind: event.kind,
          occurredAt: event.occurredAt,
          details: event.details,
        },
        null,
      ),
    );
}

function onlySignal(signals: readonly SignalInput[]): SignalInput {
  const [signal] = signals;
  if (signal === undefined || signals.length !== 1) {
    throw new Error(`expected exactly one event, got ${String(signals.length)}`);
  }
  return signal;
}

function foreign(
  kind: 'activity' | 'maintenance',
  deviceId: string,
  details: Readonly<Record<string, JsonValue>>,
): SignalInput {
  return eventSignal(
    { id: 'event-x', deviceId, kind, occurredAt: '2026-10-25T07:30:00.000Z', details },
    null,
  );
}

type Compiled = ReturnType<typeof compileTriggers>;

interface Armed {
  readonly compiled: Compiled;
  readonly entry: Compiled['signals'][number];
}

function armed(kind: string, ports: Readonly<Record<string, JsonValue>>): Armed {
  const catalog = createKindCatalog();
  registerToothbrushAutomation(catalog);
  const compiled = compileTriggers('auto-1', [trigger(kind, ports)], (id) => catalog.matcher(id));
  expect(compiled.problems).toEqual([]);
  const [entry] = compiled.signals;
  if (entry === undefined) throw new Error('the trigger did not compile');
  return { compiled, entry };
}

describe('the toothbrush automation declaration', () => {
  it('is valid and holds exactly the finished and the two brush head triggers', () => {
    const assembled = expectContributionValid({ driver: TOOTHBRUSH_AUTOMATION });
    expect(assembled.owner).toBe('driver:toothbrush');
    expect(assembled.rejections).toEqual([]);
    expect(assembled.kinds.map((kind) => kind.id).sort()).toEqual(
      [FINISHED, HEAD_DUE, HEAD_WEARING].sort(),
    );
  });

  it('is served by the catalog under the driver origin and removed again', () => {
    const catalog = createKindCatalog();
    const stop = registerToothbrushAutomation(catalog);
    expect(catalog.get(FINISHED)).toMatchObject({
      class: 'trigger',
      category: 'plugins',
      origin: { kind: 'driver', id: 'toothbrush', name: 'Toothbrush' },
      access: 'member',
    });
    expect(catalog.has(HEAD_DUE)).toBe(true);
    expect(catalog.has(HEAD_WEARING)).toBe(true);
    stop();
    expect([FINISHED, HEAD_DUE, HEAD_WEARING].some((id) => catalog.has(id))).toBe(false);
  });

  it('listens to the fields the brush ingest really writes into its activity and maintenance events', () => {
    const catalog = createKindCatalog();
    registerToothbrushAutomation(catalog);
    expect(catalog.matcher(FINISHED)?.variants['']).toEqual({
      source: 'event',
      kind: 'activity',
      match: { brushing: 'finished' },
    });
    expect(catalog.matcher(HEAD_DUE)?.variants['']).toEqual({
      source: 'event',
      kind: 'maintenance',
      match: { brushHead: 'due' },
    });
    expect(catalog.matcher(HEAD_WEARING)?.variants['']).toEqual({
      source: 'event',
      kind: 'maintenance',
      match: { brushHead: 'warn' },
    });
  });

  it('offers toothbrush devices and people as pickers', () => {
    const catalog = createKindCatalog();
    registerToothbrushAutomation(catalog);
    const inputs = (id: string): Record<string, unknown> =>
      Object.fromEntries(
        (catalog.get(id)?.inputs ?? []).map((port) => [port.name, port.type] as const),
      );
    expect(inputs(FINISHED)).toEqual({
      brush: { t: 'ref', of: 'device', families: ['toothbrush'] },
      person: { t: 'ref', of: 'person' },
    });
    expect(inputs(HEAD_DUE)).toEqual({
      brush: { t: 'ref', of: 'device', families: ['toothbrush'] },
    });
  });
});

describe('the brushing finished trigger on the real brush events', () => {
  it('fires for the chosen brush and person and hands the whole session on', async () => {
    const brushed = await open();
    brushedWhole(brushed);
    const hit = onlySignal(signalsOf(brushed, 'activity'));
    const { entry, compiled } = armed(FINISHED, {
      brush: brushed.device.id,
      person: brushed.owner.profile.id,
    });
    expect(signalMatchesMatcher(entry.matcher, hit)).toBe(true);
    expect(signalFire(compiled, hit, entry.triggerId)?.payload).toEqual({
      brush: brushed.device.id,
      person: brushed.owner.profile.id,
      duration: 120,
      coverage: 100,
      pressureWarnings: 1,
      goalMet: true,
      at: hit.at,
    });
  });

  it('reports the share of the mouth a short session reached and that the goal was missed', async () => {
    const brushed = await open();
    brushedStopped(brushed);
    const hit = onlySignal(signalsOf(brushed, 'activity'));
    const { entry, compiled } = armed(FINISHED, {});
    expect(signalMatchesMatcher(entry.matcher, hit)).toBe(true);
    const payload = signalFire(compiled, hit, entry.triggerId)?.payload;
    expect(payload).toMatchObject({ duration: 45, goalMet: false, pressureWarnings: 0 });
    const [session] = brushed.test.store.brushingSessions.all(brushed.device.id, undefined);
    const reached = session?.zones.filter((seconds) => seconds > 0).length ?? 0;
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(session?.zones.length ?? 0);
    expect(payload?.['coverage']).toBe(Math.round((reached / (session?.zones.length ?? 1)) * 100));
  });

  it('leaves out the pressure it never measured instead of inventing it', async () => {
    const brushed = await open();
    brushedWithoutPressure(brushed);
    const hit = onlySignal(signalsOf(brushed, 'activity'));
    const { entry, compiled } = armed(FINISHED, {});
    expect(signalMatchesMatcher(entry.matcher, hit)).toBe(true);
    const payload = signalFire(compiled, hit, entry.triggerId)?.payload;
    expect(payload).toMatchObject({ duration: 120, goalMet: true });
    expect(payload).not.toHaveProperty('pressureWarnings');
  });

  it('ignores another brush and another person, and still fires when the goal was missed', async () => {
    const brushed = await open();
    brushedStopped(brushed);
    const hit = onlySignal(signalsOf(brushed, 'activity'));
    expect(signalMatchesMatcher(armed(FINISHED, { brush: OTHER_BRUSH }).entry.matcher, hit)).toBe(
      false,
    );
    expect(
      signalMatchesMatcher(
        armed(FINISHED, { person: brushed.member.profile.id }).entry.matcher,
        hit,
      ),
    ).toBe(false);
    expect(
      signalMatchesMatcher(
        armed(FINISHED, { person: brushed.owner.profile.id }).entry.matcher,
        hit,
      ),
    ).toBe(true);
  });

  it('does not fire for the activity events of other devices', () => {
    const { entry } = armed(FINISHED, {});
    expect(
      signalMatchesMatcher(
        entry.matcher,
        foreign('activity', BOTTLE, { activity: 'drink', ml: 250 }),
      ),
    ).toBe(false);
    expect(
      signalMatchesMatcher(
        entry.matcher,
        foreign('activity', 'treadmill-1', { phase: 'finished', duration_s: 900 }),
      ),
    ).toBe(false);
  });
});

describe('the brush head triggers on the real brush events', () => {
  it('fires the wearing out trigger at the warning and the replace trigger when due', async () => {
    const brushed = await open();
    wornHead(brushed);
    const [warning, due] = signalsOf(brushed, 'maintenance');
    if (warning === undefined || due === undefined) throw new Error('the head events are missing');
    const wearing = armed(HEAD_WEARING, { brush: brushed.device.id });
    const replace = armed(HEAD_DUE, { brush: brushed.device.id });
    expect(signalMatchesMatcher(wearing.entry.matcher, warning)).toBe(true);
    expect(signalMatchesMatcher(wearing.entry.matcher, due)).toBe(false);
    expect(signalMatchesMatcher(replace.entry.matcher, due)).toBe(true);
    expect(signalMatchesMatcher(replace.entry.matcher, warning)).toBe(false);
    expect(signalFire(wearing.compiled, warning, wearing.entry.triggerId)?.payload).toEqual({
      brush: brushed.device.id,
      wear: 90,
      at: warning.at,
    });
    expect(signalFire(replace.compiled, due, replace.entry.triggerId)?.payload).toEqual({
      brush: brushed.device.id,
      wear: 100,
      at: due.at,
    });
  });

  it('ignores another brush', async () => {
    const brushed = await open();
    wornHead(brushed);
    const due = signalsOf(brushed, 'maintenance').at(-1);
    if (due === undefined) throw new Error('the head events are missing');
    expect(signalMatchesMatcher(armed(HEAD_DUE, { brush: OTHER_BRUSH }).entry.matcher, due)).toBe(
      false,
    );
  });

  it('does not fire for the maintenance events of other devices', () => {
    const lubrication = foreign('maintenance', 'treadmill-1', { reason: 'lubrication_due' });
    expect(signalMatchesMatcher(armed(HEAD_DUE, {}).entry.matcher, lubrication)).toBe(false);
    expect(signalMatchesMatcher(armed(HEAD_WEARING, {}).entry.matcher, lubrication)).toBe(false);
  });
});
