import {
  MAX_BELT_KMH,
  MIN_BELT_KMH,
  PAD_GOAL_KINDS,
  signalMatchesMatcher,
  type DeviceEvent,
  type JsonValue,
  type NodeKind,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import { registerDriverAutomation } from '../../../src/automations/plugin-kinds/contributions';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import {
  START_INPUT,
  TREADMILL_AUTOMATION,
  registerTreadmillAutomation,
  startTreadmill,
  type BeltControl,
  type TreadmillControls,
} from '../../../src/local/treadmill/automation';
import { eventSignal } from '../../../src/signals/sources/device';
import { trigger } from '../../support/automation-fixture';
import { captureLogs } from '../../support/logs';
import {
  COUNTDOWN,
  IDLE,
  RUNNING,
  STOPPED,
  statusHex,
  treadmillRig,
  type TreadmillRig,
} from '../../support/treadmill-rig';

const NO_RUNTIME = { tools: [], options: {} };

const OWNER = 'plugin.driver_kingsmith_treadmill';

const TRIGGER_OWNER = 'trigger.plugin.driver_kingsmith_treadmill';

let rig: TreadmillRig;

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
});

afterEach(async () => {
  await rig.close();
});

const TREADMILL_ID = 'device-treadmill';

function kindOf(id: string): NodeKind {
  const kind = createdCatalog().get(id);
  if (kind === undefined) throw new Error(`${id} is not in the catalog`);
  return kind;
}

function createdCatalog(): ReturnType<typeof createKindCatalog> {
  const catalog = createKindCatalog();
  registerTreadmillAutomation(catalog, NO_RUNTIME);
  return catalog;
}

function signalOf(event: DeviceEvent, deviceId: string = rig.device.id): SignalInput {
  return eventSignal(
    {
      id: 'event-1',
      deviceId,
      kind: event.kind,
      occurredAt: event.occurredAt,
      details: event.details,
    },
    null,
  );
}

function fireOf(
  kindId: string,
  ports: Readonly<Record<string, JsonValue>>,
  hit: SignalInput,
): { readonly matched: boolean; readonly payload: unknown } {
  const catalog = createdCatalog();
  const compiled = compileTriggers('auto-1', [trigger(kindId, ports)], (id) => catalog.matcher(id));
  expect(compiled.problems).toEqual([]);
  const [entry] = compiled.signals;
  if (entry === undefined) throw new Error('the trigger did not compile');
  return {
    matched: signalMatchesMatcher(entry.matcher, hit),
    payload: signalFire(compiled, hit, entry.triggerId)?.payload,
  };
}

describe('the Kingsmith G15 treadmill contribution', () => {
  it('is a valid driver contribution', () => {
    const assembled = expectContributionValid({ driver: TREADMILL_AUTOMATION });
    expect(assembled.owner).toBe('driver:kingsmith_treadmill');
    expect(assembled.kinds.map((kind) => kind.id).sort()).toEqual([
      `${OWNER}.start`,
      `${TRIGGER_OWNER}.fault`,
      `${TRIGGER_OWNER}.maintenance_due`,
      `${TRIGGER_OWNER}.walk_finished`,
    ]);
  });

  it('names the exact model as the origin of every kind', () => {
    const catalog = createdCatalog();
    for (const kind of catalog.kinds().filter((entry) => entry.id.includes('driver_'))) {
      expect(kind.origin).toMatchObject({
        kind: 'driver',
        id: 'kingsmith_treadmill',
        name: 'Kingsmith G15 treadmill',
      });
      expect(kind.category).toBe('plugins');
    }
  });

  it('removes its kinds when the driver stops', () => {
    const catalog = createKindCatalog();
    const stop = registerDriverAutomation(catalog, TREADMILL_AUTOMATION);
    expect(catalog.has(`${OWNER}.start`)).toBe(true);
    stop();
    expect(catalog.has(`${OWNER}.start`)).toBe(false);
    expect(catalog.matcher(`${TRIGGER_OWNER}.walk_finished`)).toBeUndefined();
  });
});

describe('the start node', () => {
  it('sends by default and can wait, with only treadmills to pick', () => {
    const kind = kindOf(`${OWNER}.start`);
    expect(kind.modes).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    const device = kind.inputs.find((port) => port.name === 'treadmill');
    expect(device).toMatchObject({
      required: true,
      type: { t: 'ref', of: 'device', families: ['treadmill'] },
    });
  });

  it('takes its speed range from the belt and invents no cap on the goal amount', () => {
    const kind = kindOf(`${OWNER}.start`);
    const speed = kind.inputs.find((port) => port.name === 'speed');
    expect(speed).toMatchObject({
      required: false,
      type: { t: 'number', min: MIN_BELT_KMH, max: MAX_BELT_KMH, unit: 'km/h' },
    });
    const amount = kind.inputs.find((port) => port.name === 'goalValue');
    expect(amount?.type).toEqual({ t: 'number', integer: true, min: 1 });
  });

  it('offers exactly the goals the treadmill stores', () => {
    const kind = kindOf(`${OWNER}.start`);
    const goal = kind.inputs.find((port) => port.name === 'goal');
    if (goal?.type.t !== 'choice') throw new Error('the goal is a choice');
    expect(goal.type.options.map((option) => option.id).sort()).toEqual([...PAD_GOAL_KINDS].sort());
  });
});

describe('startTreadmill', () => {
  function recorder(): {
    readonly controls: TreadmillControls;
    readonly sent: [BeltControl, JsonValue][];
  } {
    const sent: [BeltControl, JsonValue][] = [];
    return {
      sent,
      controls: {
        set: (control, value): Promise<JsonValue> => {
          sent.push([control, value]);
          return Promise.resolve(null);
        },
      },
    };
  }

  it('sets the goal, starts the belt and only then sets the speed', async () => {
    const { controls, sent } = recorder();
    const result = await startTreadmill(
      controls,
      START_INPUT.parse({ device: TREADMILL_ID, speed: 3.5, goal: 'distance', goalValue: 2000 }),
    );
    expect(result).toEqual({ started: true });
    expect(sent).toEqual([
      ['belt_goal', 'distance'],
      ['belt_goal_value', 2000],
      ['belt_command', 'start'],
      ['belt_speed', 3.5],
    ]);
  });

  it('only starts the belt when nothing else is asked', async () => {
    const { controls, sent } = recorder();
    await startTreadmill(controls, START_INPUT.parse({ device: TREADMILL_ID }));
    expect(sent).toEqual([['belt_command', 'start']]);
  });

  it('stops at the first control the treadmill refuses', async () => {
    const sent: BeltControl[] = [];
    const refusing: TreadmillControls = {
      set: (control): Promise<JsonValue> => {
        sent.push(control);
        return control === 'belt_goal'
          ? Promise.reject(new Error('the goal was refused'))
          : Promise.resolve(null);
      },
    };
    await expect(
      startTreadmill(refusing, START_INPUT.parse({ device: TREADMILL_ID, goal: 'time' })),
    ).rejects.toThrow('the goal was refused');
    expect(sent).toEqual(['belt_goal']);
  });

  it('rejects an amount without a goal and a speed outside the belt range', () => {
    expect(
      START_INPUT.safeParse({ device: TREADMILL_ID, goal: 'none', goalValue: 5 }).success,
    ).toBe(false);
    expect(START_INPUT.safeParse({ device: TREADMILL_ID, speed: MAX_BELT_KMH + 1 }).success).toBe(
      false,
    );
    expect(START_INPUT.safeParse({ device: TREADMILL_ID, speed: MIN_BELT_KMH }).success).toBe(true);
  });
});

function walkFor(seconds: number, from = 0): void {
  rig.batch(from, [statusHex({ state: IDLE })]);
  rig.batch(from + 1, [statusHex({ state: COUNTDOWN })]);
  for (let second = 2; second <= seconds; second += 1) {
    rig.batch(from + second, [
      statusHex({
        state: RUNNING,
        speed10: 30,
        time: second - 1,
        distance10m: Math.floor(((second - 1) * 3) / 3.6 / 10),
        steps: (second - 1) * 2,
      }),
    ]);
  }
}

function emitted(kind: DeviceEvent['kind'], phase?: string): DeviceEvent {
  const event = rig.events.find(
    (candidate) =>
      candidate.kind === kind && (phase === undefined || candidate.details['phase'] === phase),
  );
  if (event === undefined) throw new Error(`the treadmill emitted no ${kind} ${phase ?? ''}`);
  return event;
}

function detail(event: DeviceEvent, key: string): JsonValue {
  const value = event.details[key];
  if (value === undefined) throw new Error(`the ${key} detail is missing`);
  return value;
}

describe('the treadmill triggers fed by the events a walk really emits', () => {
  const WALK = `${TRIGGER_OWNER}.walk_finished`;

  function finishedWalk(): DeviceEvent {
    walkFor(62);
    rig.batch(63, [statusHex({ state: STOPPED, time: 61, distance10m: 51, steps: 122 })]);
    return emitted('activity', 'finished');
  }

  it('fires when a walk ends for the walker and hands on what was walked', () => {
    const event = finishedWalk();
    const person = rig.owner.profile.id;
    const fired = fireOf(WALK, { treadmill: rig.device.id, walker: person }, signalOf(event));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toEqual({
      walker: detail(event, 'walker'),
      person,
      duration: detail(event, 'duration_s'),
      distance: detail(event, 'distance_m'),
      steps: detail(event, 'steps'),
      at: event.occurredAt,
    });
  });

  it('ignores other walkers, other treadmills and the other stages of a walk', () => {
    const event = finishedWalk();
    const ports = { treadmill: rig.device.id, walker: rig.owner.profile.id };
    expect(fireOf(WALK, { ...ports, walker: rig.member.profile.id }, signalOf(event)).matched).toBe(
      false,
    );
    expect(fireOf(WALK, ports, signalOf(event, TREADMILL_ID)).matched).toBe(false);
    expect(fireOf(WALK, ports, signalOf(emitted('activity', 'started'))).matched).toBe(false);
  });

  it('fires on a fault the pad reports with its code', () => {
    rig.batch(1, [statusHex({ state: 4 })]);
    const event = emitted('fault');
    const fired = fireOf(`${TRIGGER_OWNER}.fault`, { treadmill: rig.device.id }, signalOf(event));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toEqual({ code: detail(event, 'code'), at: event.occurredAt });
    expect(
      fireOf(`${TRIGGER_OWNER}.fault`, { treadmill: rig.device.id }, signalOf(event, TREADMILL_ID))
        .matched,
    ).toBe(false);
  });

  it('fires on maintenance after a walk once the belt is due, with the reason', () => {
    const afterNinetyDays = 91 * 86_400;
    walkFor(62, afterNinetyDays);
    rig.batch(afterNinetyDays + 63, [
      statusHex({ state: STOPPED, time: 61, distance10m: 51, steps: 122 }),
    ]);
    const event = emitted('maintenance');
    const fired = fireOf(
      `${TRIGGER_OWNER}.maintenance_due`,
      { treadmill: rig.device.id },
      signalOf(event),
    );
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({ reason: 'lubrication_due', days: detail(event, 'days') });
  });
});
