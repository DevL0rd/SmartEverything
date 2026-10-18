import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower, type Conditions } from './support/programs';
import { useRig } from './support/use-rig';
import { fromDevice, numberValue } from './support/values';

const rig = useRig();
const NOON = '2026-10-08T12:00:00.000Z';

async function gated(conditions: Conditions): Promise<void> {
  await createAutomation(rig(), 'Gated', {
    triggers: [{ type: 'event', deviceId: null, kind: 'doorbell' }],
    conditions,
    actions: [setPower(rig().ids.lampTwo, true)],
  });
}

const QUIET_MS = 150;
const SETTLE_MS = 25;

async function rings(at: string = NOON): Promise<number> {
  rig().clock.jumpTo(at);
  const before = rig().commands().length;
  await rig().event('lamp-1', 'doorbell');
  const deadline = Date.now() + QUIET_MS;
  while (rig().commands().length === before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  return rig().commands().length - before;
}

const lampPower = (value: boolean): Conditions['items'][number] => ({
  type: 'state',
  deviceId: rig().ids.lamp,
  capability: 'power',
  comparison: { operator: 'eq', value },
});

describe('C10 conditions', () => {
  it('holds a run back while a device value does not match and lets it through when it does', async () => {
    await gated({ mode: 'all', items: [lampPower(true)] });
    await rig().state('lamp-1', 'power', false);
    expect(await rings()).toBe(0);
    await rig().state('lamp-1', 'power', true);
    expect(await rings()).toBe(1);
  });

  it('needs every condition with all and a single one with any', async () => {
    await rig().state('lamp-1', 'power', true);
    await rig().state('fan-1', 'power', false);
    const fanOn: Conditions['items'][number] = {
      type: 'state',
      deviceId: rig().ids.fan,
      capability: 'power',
      comparison: { operator: 'eq', value: true },
    };
    await gated({ mode: 'all', items: [lampPower(true), fanOn] });
    expect(await rings()).toBe(0);
    await rig().state('fan-1', 'power', true);
    expect(await rings()).toBe(1);
  });

  it('with any needs just one of its conditions', async () => {
    await rig().state('lamp-1', 'power', true);
    await rig().state('fan-1', 'power', false);
    await gated({
      mode: 'any',
      items: [
        {
          type: 'state',
          deviceId: rig().ids.fan,
          capability: 'power',
          comparison: { operator: 'eq', value: true },
        },
        lampPower(true),
      ],
    });
    expect(await rings()).toBe(1);
  });

  it('checks a time window that wraps past midnight with an inclusive start and exclusive end', async () => {
    await gated({ mode: 'all', items: [{ type: 'time_window', after: '22:00', before: '06:00' }] });
    expect(await rings('2026-10-08T12:00:00.000Z')).toBe(0);
    expect(await rings('2026-10-08T23:30:00.000Z')).toBe(1);
    expect(await rings('2026-10-09T03:00:00.000Z')).toBe(1);
    expect(await rings('2026-10-09T06:00:00.000Z')).toBe(0);
    expect(await rings('2026-10-09T22:00:00.000Z')).toBe(1);
  });

  it('checks the weekday in the home time zone', async () => {
    await gated({ mode: 'all', items: [{ type: 'weekday', weekdays: [4] }] });
    expect(await rings('2026-10-08T12:00:00.000Z')).toBe(1);
    expect(await rings('2026-10-09T12:00:00.000Z')).toBe(0);
  });

  it('checks weather metrics and the kind of weather against the latest forecast', async () => {
    await rig().sky.set({ temperature: 12, code: 63 });
    await gated({
      mode: 'all',
      items: [
        { type: 'weather', metric: 'temperature', comparison: { operator: 'lt', value: 15 } },
        { type: 'weather_kind', kinds: ['rain'] },
      ],
    });
    expect(await rings()).toBe(1);
    await rig().sky.set({ temperature: 20 });
    expect(await rings()).toBe(0);
  });

  it('tells day from night at the home location with offsets for sunrise and sunset', async () => {
    await gated({
      mode: 'all',
      items: [{ type: 'daylight', is: 'day', sunriseOffsetMinutes: 0, sunsetOffsetMinutes: 0 }],
    });
    expect(await rings('2026-10-08T12:00:00.000Z')).toBe(1);
    expect(await rings('2026-10-08T23:00:00.000Z')).toBe(0);
    expect(await rings('2026-10-08T17:00:00.000Z')).toBe(0);
  });

  it('extends the day by a sunset offset', async () => {
    await gated({
      mode: 'all',
      items: [{ type: 'daylight', is: 'day', sunriseOffsetMinutes: 0, sunsetOffsetMinutes: 180 }],
    });
    expect(await rings('2026-10-08T17:00:00.000Z')).toBe(1);
  });

  it('compares a Value', async () => {
    const level = await numberValue(rig(), 'Level', 3);
    await gated({
      mode: 'all',
      items: [{ type: 'value', valueId: level.id, comparison: { operator: 'gte', value: 5 } }],
    });
    expect(await rings()).toBe(0);
    await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'set', value: 6 } },
    });
    expect(await rings()).toBe(1);
  });

  it('compares a live device reading', async () => {
    await rig().state('sensor-1', 'temperature', 10);
    await gated({
      mode: 'all',
      items: [
        {
          type: 'binding',
          input: fromDevice(rig().ids.sensor, 'temperature'),
          comparison: { operator: 'gt', value: 20 },
        },
      ],
    });
    expect(await rings()).toBe(0);
    await rig().state('sensor-1', 'temperature', 25);
    expect(await rings()).toBe(1);
  });
});
