import { afterEach, describe, expect, it } from 'vitest';
import type {
  AutomationRowV3,
  FlowNode,
  PortValue,
  SignalInput,
  TriggerNode,
} from '@smarteverything/domain';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
  triggerChecks,
  wired,
} from '../support/rig-v3';
import type { Expectation } from '../support/rig-v3';
import type { RigV3 } from '../support/rig-v3';

afterEach(closeSetups);

const WHEN = '2026-10-08T12:00:00.000Z';

function reading(rig: RigV3, value: number | null): void {
  rig.home.db.store.state.write([
    {
      deviceId: rig.home.lampId,
      capability: 'temperature',
      value,
      observedAt: new Date(rig.clock.now()).toISOString(),
    },
  ]);
}

function dims(rig: RigV3): unknown[] {
  return rig.home.adapter.executed.map((command) => command.value);
}

function dimTo(rig: RigV3, value: PortValue): FlowNode {
  return node('dim', 'device.set', {
    target: lit({ device: rig.home.lampId }),
    control: lit('brightness'),
    to: value,
  });
}

function watchingTemperature(rig: RigV3, extra: Record<string, PortValue> = {}): AutomationRowV3 {
  return rig.add(
    program(
      [
        node('room', 'device.get', {
          device: lit(rig.home.lampId),
          control: lit('temperature'),
        }),
        node('hot', 'logic.compare', { a: wired('room.value'), op: lit('gt'), b: lit(26) }),
        ...triggerChecks([['key', 'becomes_true']], { yes: 31, no: 99 }, (value) =>
          dimTo(rig, value),
        ),
      ],
      {
        triggers: [trigger('trigger.becomes_true', { condition: wired('hot.result'), ...extra })],
      },
    ),
  );
}

describe('trigger.becomes_true on the engine', () => {
  it('starts a run when a device value makes the condition true, once, and again only after it fell', async () => {
    const rig = await rigV3();
    reading(rig, 20);
    const row = watchingTemperature(rig);
    rig.engine.sync();
    reading(rig, 24);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(0);
    reading(rig, 27);
    await rig.until(() => rig.finished.length === 1);
    reading(rig, 29);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(1);
    reading(rig, 22);
    reading(rig, 30);
    await rig.until(() => rig.finished.length === 2);
    expect(dims(rig)).toStrictEqual([31, 31]);
    expect(rig.runs(row.id).map((run) => run.status)).toStrictEqual(['succeeded', 'succeeded']);
  });

  it('does not start when the condition is already true as the automation is loaded', async () => {
    const rig = await rigV3();
    reading(rig, 30);
    const row = watchingTemperature(rig);
    rig.engine.sync();
    reading(rig, 31);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(0);
  });

  it('waits for the hold and forgets it when the condition falls first', async () => {
    const rig = await rigV3();
    reading(rig, 20);
    const row = watchingTemperature(rig, { hold: lit(300_000) });
    rig.engine.sync();
    reading(rig, 27);
    await rig.advance(200_000);
    reading(rig, 20);
    await rig.advance(200_000);
    expect(rig.runs(row.id)).toHaveLength(0);
    reading(rig, 28);
    await rig.advance(299_000);
    expect(rig.runs(row.id)).toHaveLength(0);
    await rig.advance(1000);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)).toHaveLength(1);
  });

  it('stops watching when the automation is disabled and watches again when it is enabled', async () => {
    const rig = await rigV3();
    reading(rig, 20);
    const row = watchingTemperature(rig);
    rig.engine.sync();
    rig.setEnabled(row.id, false);
    rig.engine.sync();
    reading(rig, 27);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(0);
    rig.setEnabled(row.id, true);
    reading(rig, 20);
    rig.engine.sync();
    reading(rig, 27);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)).toHaveLength(1);
  });

  it('never starts while the value it reads is missing, and starts when it arrives', async () => {
    const rig = await rigV3();
    const row = watchingTemperature(rig);
    rig.engine.sync();
    reading(rig, null);
    await rig.settle();
    expect(rig.runs(row.id)).toHaveLength(0);
    reading(rig, 27);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)).toHaveLength(1);
  });
});

interface Driven {
  readonly trigger: TriggerNode;
  readonly check: Expectation;
  readonly signal: SignalInput;
}

async function drive(rig: RigV3, driven: Driven): Promise<void> {
  const nodes = triggerChecks(driven.check, { yes: 41, no: 99 }, (value) => dimTo(rig, value));
  rig.add(program(nodes, { triggers: [driven.trigger] }));
  rig.engine.sync();
  rig.engine.observe(driven.signal);
  await rig.until(() => rig.finished.length === 1);
}

function signalOf(overrides: Partial<SignalInput>): SignalInput {
  return {
    source: 'event',
    kind: 'app_opened',
    subject: 'desk',
    field: null,
    value: true,
    previous: null,
    at: WHEN,
    profileId: null,
    data: {},
    ...overrides,
  };
}

describe('signal-backed triggers reach the run as their typed outputs', () => {
  it('trigger.computer gives the computer, the kind, the app and the title of an app event', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.computer', {
        computer: lit('desk'),
        kind: lit('app_open'),
        app: lit('Steam'),
      }),
      check: [
        ['computer', 'desk'],
        ['kind', 'app_open'],
        ['app', 'Steam'],
        ['title', 'Library'],
        ['key', 'computer'],
      ],
      signal: signalOf({ data: { app: 'Steam', title: 'Library', summary: 'Steam opened' } }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.computer ignores another app', async () => {
    const rig = await rigV3();
    rig.add(
      program([dimTo(rig, lit(41))], {
        triggers: [trigger('trigger.computer', { kind: lit('app_open'), app: lit('Steam') })],
      }),
    );
    rig.engine.sync();
    rig.engine.observe(signalOf({ data: { app: 'Spotify' } }));
    await rig.settle();
    expect(rig.finished).toHaveLength(0);
  });

  it('trigger.computer tells which power action happened', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.computer', { kind: lit('power_lock_screen') }),
      check: [
        ['kind', 'power'],
        ['action', 'lock_screen'],
      ],
      signal: signalOf({
        kind: 'computer_power',
        data: { action: 'lock_screen', source: 'app', client: 'c1' },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.phone gives the kind and the details of a change of activity', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.phone', { kind: lit('context_changed'), to: lit('driving') }),
      check: [
        ['kind', 'context_changed'],
        ['data.from', 'still'],
        ['data.to', 'driving'],
      ],
      signal: signalOf({
        kind: 'phone_context_changed',
        subject: 'phone-1',
        data: { from: 'still', to: 'driving', confidence: 90, place: null },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.phone starts on an unlock', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.phone', {}),
      check: [
        ['kind', 'unlocked'],
        ['phone', 'phone-1'],
      ],
      signal: signalOf({ kind: 'phone_unlocked', subject: 'phone-1' }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.health gives the kind and the details when sleep ends', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.health', {}),
      check: [
        ['kind', 'sleep_ended'],
        ['person', 'ann'],
        ['data.minutes', 420],
      ],
      signal: signalOf({
        source: 'health',
        kind: 'sleep_ended',
        subject: 'ann',
        value: '2026-10-08T06:00:00.000Z',
        profileId: 'ann',
        data: { endedAt: '2026-10-08T06:00:00.000Z', day: '2026-10-08', minutes: 420 },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.health gives the metric and value of a scale reading that passes its test', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.health', {
        kind: lit('body_reading'),
        metric: lit('weight_kg'),
        test: lit({ is: 'gt', to: 80 }),
      }),
      check: [
        ['metric', 'weight_kg'],
        ['value', 85.5],
        ['person', 'ann'],
      ],
      signal: signalOf({
        source: 'health',
        kind: 'body_reading',
        subject: 'ann',
        field: 'weight_kg',
        value: 85.5,
        profileId: 'ann',
        data: { readingId: 'r1', deviceId: 'scale' },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.chat gives the chat, how the reply ended and the reply', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.chat', { outcome: lit('failed') }),
      check: [
        ['chat', 'chat-1'],
        ['outcome', 'failed'],
        ['messageId', 'm1'],
        ['person', 'ann'],
      ],
      signal: signalOf({
        source: 'assistant',
        kind: 'reply_finished',
        subject: 'chat-1',
        value: 'failed',
        profileId: 'ann',
        data: { outcome: 'failed', messageId: 'm1' },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.event gives the name and the payload an automation sent', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.event', { name: lit('guest_mode_on') }),
      check: [
        ['name', 'guest_mode_on'],
        ['payload.who', 'ann'],
        ['payload.automationId', undefined],
      ],
      signal: signalOf({
        source: 'automation_event',
        kind: 'sent',
        subject: null,
        field: 'guest_mode_on',
        data: { who: 'ann', automationId: 'other' },
      }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });

  it('trigger.hub_started starts once when the hub says it started', async () => {
    const rig = await rigV3();
    await drive(rig, {
      trigger: trigger('trigger.hub_started', {}),
      check: [['key', 'hub_started']],
      signal: signalOf({ source: 'hub', kind: 'started', subject: null }),
    });
    expect(dims(rig)).toStrictEqual([41]);
  });
});
