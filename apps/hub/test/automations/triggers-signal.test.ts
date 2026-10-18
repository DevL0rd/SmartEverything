import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower, type Triggers } from './support/programs';
import { useRig } from './support/use-rig';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig();
const T0 = '2026-10-08T10:00:00.000Z';

function at(seconds: number): string {
  return new Date(Date.parse(T0) + seconds * 1000).toISOString();
}

async function armed(signal: Triggers[number]): Promise<void> {
  rig().clock.jumpTo(T0);
  await createAutomation(rig(), 'Signal', {
    triggers: [signal],
    actions: [setPower(rig().ids.lamp, true)],
  });
}

async function runs(count: number): Promise<void> {
  await rig().until(() => rig().commands().length >= count);
  await rig().settle();
}

function temperature(extra: Record<string, unknown>): Triggers[number] {
  return {
    type: 'signal',
    source: 'device',
    kind: 'state',
    subject: rig().ids.sensor,
    field: 'temperature',
    ...extra,
  };
}

describe('C7 generic signals', () => {
  it('fires for the matching subject and field only', async () => {
    await armed(temperature({ comparison: { operator: 'gt', value: 25 } }));
    await rig().state('sensor-1', 'occupancy', true);
    await rig().state('fan-1', 'fan_speed', 90);
    await rig().state('sensor-1', 'temperature', 30);
    await runs(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('fires only when every named match key equals the detail of the signal', async () => {
    await armed({
      type: 'signal',
      source: 'event',
      kind: 'sound',
      match: { detection: 'baby_cry' },
    });
    await rig().event('sensor-1', 'sound', { detection: 'loud_sound' });
    await rig().event('sensor-1', 'sound', {});
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().event('sensor-1', 'sound', { detection: 'baby_cry' });
    await runs(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('fires on every pulse signal such as an event', async () => {
    await armed({ type: 'signal', source: 'event', kind: 'doorbell' });
    await rig().event('lamp-1', 'doorbell');
    await rig().event('lamp-1', 'doorbell');
    await runs(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('waits for the hold time and fires only if the comparison stayed true', async () => {
    await armed(temperature({ comparison: { operator: 'gt', value: 25 }, holdSeconds: 10 }));
    await rig().state('sensor-1', 'temperature', 30);
    rig().clock.advanceTo(at(5));
    await rig().state('sensor-1', 'temperature', 20);
    rig().clock.advanceTo(at(30));
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().state('sensor-1', 'temperature', 30);
    rig().clock.advanceTo(at(35));
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    rig().clock.advanceTo(at(41));
    await runs(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('decides only after no new signal arrived for the debounce time', async () => {
    await armed({
      type: 'signal',
      source: 'event',
      kind: 'motion',
      debounceSeconds: 5,
    });
    await rig().event('sensor-1', 'motion');
    rig().clock.advanceTo(at(2));
    await rig().event('sensor-1', 'motion');
    rig().clock.advanceTo(at(6));
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    rig().clock.advanceTo(at(8));
    await runs(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('fires at most once within the cooldown', async () => {
    await armed({ type: 'signal', source: 'event', kind: 'motion', cooldownSeconds: 10 });
    await rig().event('sensor-1', 'motion');
    await runs(1);
    rig().clock.advanceTo(at(5));
    await rig().event('sensor-1', 'motion');
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
    rig().clock.advanceTo(at(11));
    await rig().event('sensor-1', 'motion');
    await runs(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('compares a rolling average over the window and fires on entering the comparison', async () => {
    await armed(
      temperature({
        comparison: { operator: 'gt', value: 25 },
        window: { mode: 'avg', seconds: 60 },
      }),
    );
    await rig().state('sensor-1', 'temperature', 20);
    await rig().state('sensor-1', 'temperature', 40);
    await runs(1);
    await rig().state('sensor-1', 'temperature', 41);
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
  });

  it('forgets samples older than the window', async () => {
    await armed(
      temperature({
        comparison: { operator: 'gt', value: 25 },
        window: { mode: 'avg', seconds: 60 },
      }),
    );
    await rig().state('sensor-1', 'temperature', 40);
    await runs(1);
    rig().clock.advanceTo(at(120));
    await rig().state('sensor-1', 'temperature', 20);
    await rig().state('sensor-1', 'temperature', 27);
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
    await rig().state('sensor-1', 'temperature', 40);
    await runs(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('counts the signals inside the window', async () => {
    await armed({
      type: 'signal',
      source: 'event',
      kind: 'motion',
      comparison: { operator: 'gte', value: 3 },
      window: { mode: 'count', seconds: 60 },
    });
    await rig().event('sensor-1', 'motion');
    await rig().event('sensor-1', 'motion');
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().event('sensor-1', 'motion');
    await runs(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('refuses a trigger for a signal kind this home does not have', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Unknown',
        definition: legacyAutomation({
          triggers: [{ type: 'signal', source: 'device', kind: 'does_not_exist' }],
          conditions: { mode: 'all', items: [] },
          actions: [setPower(rig().ids.lamp, true)],
        }),
      },
    });
    expect(refusal.status).toBe(400);
  });
});
