import {
  BOTTLE_DRIVER,
  signalMatchesMatcher,
  waterEntryOf,
  type DeviceEvent,
  type JsonValue,
  type SignalInput,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import { registerDriverAutomation } from '../../../src/automations/plugin-kinds/contributions';
import { compileTriggers, signalFire } from '../../../src/automations/triggers-v3/armers';
import { BOTTLE_AUTOMATION, registerBottleAutomation } from '../../../src/local/bottle/automation';
import { TREADMILL_AUTOMATION } from '../../../src/local/treadmill/automation';
import { expectContributionValid } from '../../../src/plugins/builtin/automation-kit';
import { eventSignal } from '../../../src/signals/sources/device';
import { trigger } from '../../support/automation-fixture';
import { bottleRig, tofRow, type BottleRig } from '../../support/bottle-rig';
import { captureLogs } from '../../support/logs';

const OWNER = 'trigger.plugin.driver_larq_bottle';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

function catalogOf(): ReturnType<typeof createKindCatalog> {
  const catalog = createKindCatalog();
  registerBottleAutomation(catalog);
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

function emitted(name: string): DeviceEvent {
  const event = rig.events.find(
    (candidate) =>
      candidate.details['activity'] === name || candidate.details['maintenance'] === name,
  );
  if (event === undefined) throw new Error(`the sync emitted no ${name} event`);
  return event;
}

function detail(event: DeviceEvent, key: string): JsonValue {
  const value = event.details[key];
  if (value === undefined) throw new Error(`the ${key} detail is missing`);
  return value;
}

function fireOf(
  id: string,
  ports: Readonly<Record<string, JsonValue>>,
  hit: SignalInput,
): { readonly matched: boolean; readonly payload: unknown } {
  const catalog = catalogOf();
  const compiled = compileTriggers('auto-1', [trigger(`${OWNER}.${id}`, ports)], (kind) =>
    catalog.matcher(kind),
  );
  expect(compiled.problems).toEqual([]);
  const [entry] = compiled.signals;
  if (entry === undefined) throw new Error('the trigger did not compile');
  return {
    matched: signalMatchesMatcher(entry.matcher, hit),
    payload: signalFire(compiled, hit, entry.triggerId)?.payload,
  };
}

describe('the LARQ PureVis 2 bottle contribution', () => {
  it('is a valid driver contribution with a trigger for every bottle event', () => {
    const assembled = expectContributionValid({ driver: BOTTLE_AUTOMATION });
    expect(assembled.owner).toBe('driver:larq_bottle');
    expect(assembled.kinds.map((kind) => kind.id).sort()).toEqual(
      [
        'charging_finished',
        'charging_started',
        'drink',
        'goal_reached',
        'refill',
        'uv_clean_done',
      ].map((id) => `${OWNER}.${id}`),
    );
  });

  it('names the exact model and offers only bottles to pick', () => {
    const catalog = catalogOf();
    const drink = catalog.get(`${OWNER}.drink`);
    expect(drink?.origin).toMatchObject({
      kind: 'driver',
      id: BOTTLE_DRIVER,
      name: 'LARQ PureVis 2 bottle',
    });
    expect(drink?.inputs.find((port) => port.name === 'bottle')?.type).toEqual({
      t: 'ref',
      of: 'device',
      families: ['bottle'],
    });
    expect(drink?.inputs.find((port) => port.name === 'person')?.type).toEqual({
      t: 'ref',
      of: 'person',
    });
  });

  it('does not clash with the treadmill driver in one catalog', () => {
    const catalog = createKindCatalog();
    registerDriverAutomation(catalog, BOTTLE_AUTOMATION);
    registerDriverAutomation(catalog, TREADMILL_AUTOMATION);
    const ids = catalog.kinds().map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalog.has(`${OWNER}.drink`)).toBe(true);
    expect(catalog.has('trigger.plugin.driver_kingsmith_treadmill.walk_finished')).toBe(true);
  });

  it('removes its kinds when the driver stops', () => {
    const catalog = createKindCatalog();
    const stop = registerBottleAutomation(catalog);
    stop();
    expect(catalog.has(`${OWNER}.drink`)).toBe(false);
  });
});

describe('the bottle triggers fed by the events a sync really emits', () => {
  async function drinkNow(): Promise<void> {
    rig.cap.tof.rows.push(tofRow(rig.seconds(-29), 28), tofRow(rig.seconds(-5), 66));
    await rig.sync();
  }

  it('fires on a drink for the right person with the amount and what is left', async () => {
    await drinkNow();
    const event = emitted('drink');
    const person = rig.owner.profile.id;
    const fired = fireOf('drink', { bottle: rig.device.id, person }, signalOf(event));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({
      ml: detail(event, 'ml'),
      levelMl: detail(event, 'levelMl'),
      person,
      at: event.occurredAt,
    });
    expect(
      fireOf('drink', { bottle: rig.device.id, person: rig.member.profile.id }, signalOf(event))
        .matched,
    ).toBe(false);
    expect(fireOf('drink', {}, signalOf(event, 'device-other')).matched).toBe(true);
    expect(
      fireOf('drink', { bottle: rig.device.id }, signalOf(event, 'device-other')).matched,
    ).toBe(false);
  });

  it('keeps drinks, refills and imports apart', async () => {
    rig.cap.tof.rows.push(
      tofRow(rig.seconds(-29), 28),
      tofRow(rig.seconds(-20), 78),
      tofRow(rig.seconds(-5), 28, 'cap_on_flap'),
    );
    await rig.sync();
    const refill = emitted('refill');
    expect(fireOf('drink', {}, signalOf(refill)).matched).toBe(false);
    const fired = fireOf('refill', { bottle: rig.device.id }, signalOf(refill));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({ ml: detail(refill, 'ml'), at: refill.occurredAt });
    expect(fireOf('refill', {}, signalOf(emitted('drink'))).matched).toBe(false);
  });

  it('fires when the daily goal is reached with the total and the goal', async () => {
    const today = '2026-10-18';
    rig.test.store.healthEntries.create(
      rig.owner.profile.id,
      waterEntryOf(1900, {
        startTime: `${today}T07:00:00.000Z`,
        endTime: `${today}T07:01:00.000Z`,
        zoneOffsetSeconds: 0,
      }),
    );
    rig.cap.tof.rows.push(tofRow(rig.seconds(-20), 28), tofRow(rig.seconds(-10), 78));
    await rig.sync();
    const event = emitted('goal_reached');
    const person = rig.owner.profile.id;
    const fired = fireOf('goal_reached', { bottle: rig.device.id, person }, signalOf(event));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({
      ml: detail(event, 'ml'),
      goalMl: detail(event, 'goalMl'),
      person,
    });
    expect(fireOf('goal_reached', { person: rig.member.profile.id }, signalOf(event)).matched).toBe(
      false,
    );
  });

  it('fires when a UV clean ends with the mode and the battery', async () => {
    rig.cap.activation.rows.push({ at: rig.seconds(-2), mode: 'normal', socPct: 64 });
    await rig.sync();
    const event = emitted('uv_clean');
    const fired = fireOf('uv_clean_done', { bottle: rig.device.id }, signalOf(event));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({ mode: 'normal', battery: 64, at: event.occurredAt });
  });

  it('tells the start of charging from its end', async () => {
    rig.cap.uiState = 8;
    rig.cap.battery = 14;
    await rig.sync();
    const started = emitted('charging_started');
    const fired = fireOf('charging_started', { bottle: rig.device.id }, signalOf(started));
    expect(fired.matched).toBe(true);
    expect(fired.payload).toMatchObject({
      battery: detail(started, 'pct'),
      at: started.occurredAt,
    });
    expect(fireOf('charging_finished', {}, signalOf(started)).matched).toBe(false);
  });
});
