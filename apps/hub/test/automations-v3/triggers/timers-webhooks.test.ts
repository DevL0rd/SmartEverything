import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FlowNode, PortValue } from '@smarteverything/domain';
import { JSON_VALUE } from '@smarteverything/domain';
import { TIMER_MEMORY, timer } from '@smarteverything/flow/nodes/state/timer';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { integrationEffects } from '../../../src/automations/integration-effects';
import type { IntegrationPorts } from '../../../src/automations/integration-effects';
import { WebhookReplies } from '../../../src/automations/effects/webhook-replies';
import { TimerWakes } from '../../../src/automations/timers/timer-wakes';
import { WebhookGateway } from '../../../src/automations/webhooks/gateway';
import type { WebhookCall } from '../../../src/automations/webhooks/gateway';
import { stateMemoryFromRows } from '../../../src/automations/world-v3/node-memory';
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
import type { RigV3 } from '../support/rig-v3';

afterEach(closeSetups);

function dimTo(rig: RigV3, value: PortValue): FlowNode {
  return node('dim', 'device.set', {
    target: lit({ device: rig.home.lampId }),
    control: lit('brightness'),
    to: value,
  });
}

function dims(rig: RigV3): unknown[] {
  return rig.home.adapter.executed.map((command) => command.value);
}

function wakesOf(rig: RigV3): TimerWakes {
  return new TimerWakes({
    rows: rig.home.db.store.automationNodeState,
    clock: rig.clock,
    emit: (signal): void => {
      rig.engine.observe(signal);
    },
  });
}

interface Start {
  readonly owner: string;
  readonly name: string;
  readonly durationMs: number;
}

function startTimer(rig: RigV3, wakes: TimerWakes, start: Start): ReturnType<typeof timer> {
  const { owner, name, durationMs } = start;
  const memory = stateMemoryFromRows(rig.home.db.store.automationNodeState, wakes);
  const slot = `timer:${name}`;
  const recalled = memory.recall(owner, slot);
  const started = timer(recalled === undefined ? undefined : TIMER_MEMORY.parse(recalled), {
    now: rig.clock.now().getTime(),
    op: 'start',
    durationMs,
  });
  memory.keep(owner, slot, JSON_VALUE.parse(started.memory), started.wakeAt);
  return started;
}

describe('trigger.timer and the timer wakes', () => {
  it('starts the automation when the timer another automation started ends, once', async () => {
    const rig = await rigV3();
    const owner = rig.add(program([dimTo(rig, lit(1))]), 'Starts the timer');
    const row = rig.add(
      program(
        triggerChecks(
          [
            ['timer', 'laundry'],
            ['key', 'timer'],
          ],
          { yes: 51, no: 99 },
          (value) => dimTo(rig, value),
        ),
        { triggers: [trigger('trigger.timer', { timer: lit('laundry') })] },
      ),
      'Laundry is done',
    );
    rig.engine.sync();
    const wakes = wakesOf(rig);
    rig.useTimers(wakes);
    wakes.start();
    startTimer(rig, wakes, { owner: owner.id, name: 'laundry', durationMs: 600_000 });
    await rig.advance(599_000);
    expect(rig.runs(row.id)).toHaveLength(0);
    await rig.advance(1000);
    await rig.until(() => rig.finished.length === 1);
    await rig.advance(3_600_000);
    expect(dims(rig)).toStrictEqual([51]);
    expect(rig.runs(row.id)).toHaveLength(1);
    wakes.stop();
  });

  it('ignores a timer with another name', async () => {
    const rig = await rigV3();
    const owner = rig.add(program([dimTo(rig, lit(1))]), 'Starts the timer');
    const row = rig.add(
      program([dimTo(rig, lit(51))], {
        triggers: [trigger('trigger.timer', { timer: lit('laundry') })],
      }),
      'Laundry is done',
    );
    rig.engine.sync();
    const wakes = wakesOf(rig);
    rig.useTimers(wakes);
    wakes.start();
    startTimer(rig, wakes, { owner: owner.id, name: 'oven', durationMs: 60_000 });
    await rig.advance(120_000);
    expect(rig.runs(row.id)).toHaveLength(0);
    wakes.stop();
  });

  it('fires a timer that ended while the hub was down as soon as the hub is back', async () => {
    const rig = await rigV3();
    const owner = rig.add(program([dimTo(rig, lit(1))]), 'Starts the timer');
    const row = rig.add(
      program([dimTo(rig, lit(52))], {
        triggers: [trigger('trigger.timer', { timer: lit('laundry') })],
      }),
      'Laundry is done',
    );
    rig.engine.sync();
    const before = wakesOf(rig);
    before.start();
    startTimer(rig, before, { owner: owner.id, name: 'laundry', durationMs: 600_000 });
    before.stop();
    rig.clock.jumpTo('2026-10-08T13:00:00.000Z');
    const after = wakesOf(rig);
    after.start();
    await rig.until(() => rig.finished.length === 1);
    expect(dims(rig)).toStrictEqual([52]);
    expect(rig.runs(row.id)).toHaveLength(1);
    after.stop();
  });

  it('leaves the other kept state alone, even when it is due', async () => {
    const rig = await rigV3();
    const owner = rig.add(program([dimTo(rig, lit(1))]), 'Keeps state');
    const row = rig.add(
      program([dimTo(rig, lit(54))], {
        triggers: [trigger('trigger.timer', { timer: lit('cooldown') })],
      }),
      'Listens',
    );
    rig.engine.sync();
    const wakes = wakesOf(rig);
    wakes.start();
    const memory = stateMemoryFromRows(rig.home.db.store.automationNodeState, wakes);
    memory.keep(owner.id, 'cooldown:lamp', { until: 1 }, rig.clock.now().getTime() + 1000);
    await rig.advance(5000);
    expect(rig.runs(row.id)).toHaveLength(0);
    expect(rig.clock.pending()).toEqual([]);
    wakes.stop();
  });

  it('does not fire a paused or cancelled timer', async () => {
    const rig = await rigV3();
    const owner = rig.add(program([dimTo(rig, lit(1))]), 'Starts the timer');
    const row = rig.add(
      program([dimTo(rig, lit(53))], {
        triggers: [trigger('trigger.timer', { timer: lit('laundry') })],
      }),
      'Laundry is done',
    );
    rig.engine.sync();
    const wakes = wakesOf(rig);
    rig.useTimers(wakes);
    wakes.start();
    const memory = stateMemoryFromRows(rig.home.db.store.automationNodeState, wakes);
    const started = startTimer(rig, wakes, {
      owner: owner.id,
      name: 'laundry',
      durationMs: 600_000,
    });
    const paused = timer(started.memory, { now: rig.clock.now().getTime(), op: 'pause' });
    memory.keep(owner.id, 'timer:laundry', JSON_VALUE.parse(paused.memory), paused.wakeAt);
    await rig.advance(3_600_000);
    expect(rig.runs(row.id)).toHaveLength(0);
    expect(rig.clock.pending()).toEqual([]);
    wakes.stop();
  });
});

const PATH = 'k3Jq9Zr2Lm8Xv5Bn7TcWd1';

function webhook(rig: RigV3, replies: WebhookReplies): WebhookGateway {
  const gateway = new WebhookGateway({
    signals: {
      emit: (signal): void => {
        rig.engine.observe(signal);
      },
    },
    replies,
    clock: rig.clock,
    token: randomUUID,
  });
  gateway.attach(rig.engine);
  rig.onStart((start) => {
    gateway.started(start);
  });
  return gateway;
}

function call(overrides: Partial<WebhookCall> = {}): WebhookCall {
  return {
    path: PATH,
    method: 'POST',
    body: { who: 'ann' },
    headers: { 'content-type': 'application/json' },
    query: { a: '1' },
    ...overrides,
  };
}

async function webhookRig(): Promise<{ rig: RigV3; replies: WebhookReplies }> {
  const replies = new WebhookReplies();
  const ports: IntegrationPorts = {
    model: {
      ask: () => Promise.reject(new Error('unused')),
      decide: () => Promise.reject(new Error('unused')),
    },
    pictures: {
      take: () => Promise.reject(new Error('unused')),
      load: () => Promise.reject(new Error('unused')),
    },
    computers: new AutomationComputersSlot(),
    tools: {
      check: () => {
        throw new Error('unused');
      },
      call: () => Promise.reject(new Error('unused')),
    },
    signals: { emit: (): void => undefined },
    replies,
    clock: { now: () => new Date('2026-10-08T12:00:00.000Z') },
    ownerProfileId: () => 'owner',
  };
  const rig = await rigV3({ extraEffects: integrationEffects(ports) });
  return { rig, replies };
}

describe('trigger.webhook and http.respond', () => {
  it('starts the automation with the call and answers with what http.respond says', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    const row = rig.add(
      program(
        [
          node('who', 'object.get', { source: wired('trigger.body'), path: lit('who') }),
          node('a', 'object.get', { source: wired('trigger.query'), path: lit('a') }),
          node('hello', 'object.set', {
            source: lit({}),
            path: lit('hello'),
            value: wired('who.value'),
          }),
          node('method', 'object.set', {
            source: wired('hello.record'),
            path: lit('method'),
            value: wired('trigger.method'),
          }),
          node('query', 'object.set', {
            source: wired('method.record'),
            path: lit('a'),
            value: wired('a.value'),
          }),
          node('answer', 'http.respond', { status: lit(201), body: wired('query.record') }),
          ...triggerChecks(
            [['headers.content-type', 'application/json']],
            { yes: 61, no: 99 },
            (value) => dimTo(rig, value),
          ),
        ],
        { triggers: [trigger('trigger.webhook', { path: lit(PATH), method: lit('POST') })] },
      ),
    );
    rig.engine.sync();
    const reply = await gateway.call(call());
    expect(reply).toEqual({
      status: 201,
      body: { hello: 'ann', method: 'POST', a: '1' },
      headers: {},
    });
    await rig.until(() => rig.finished.length === 1);
    expect(dims(rig)).toStrictEqual([61]);
    expect(rig.runs(row.id)).toHaveLength(1);
    expect(replies.waiting).toBe(0);
  });

  it('answers 202 when the automation never answers and then waits', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    rig.add(
      program([node('pause', 'flow.wait', { duration: lit(3_600_000) }), dimTo(rig, lit(62))], {
        triggers: [trigger('trigger.webhook', { path: lit(PATH) })],
      }),
    );
    rig.engine.sync();
    expect(await gateway.call(call({ method: 'GET', body: undefined }))).toEqual({
      status: 202,
      body: { accepted: true },
      headers: {},
    });
  });

  it('answers 204 when the run ends without answering', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    rig.add(
      program([dimTo(rig, lit(63))], {
        triggers: [trigger('trigger.webhook', { path: lit(PATH) })],
      }),
    );
    rig.engine.sync();
    const reply = await gateway.call(call());
    expect(reply).toEqual({ status: 204, body: undefined, headers: {} });
    expect(dims(rig)).toStrictEqual([63]);
  });

  it('answers 500 with the reason when the run fails before it answers', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    rig.add(
      program(
        [
          node('missing', 'object.get', { source: wired('trigger.body'), path: lit('missing') }),
          node('bad', 'device.set', {
            target: lit({ device: rig.home.lampId }),
            control: lit('brightness'),
            to: wired('missing.value'),
          }),
        ],
        { triggers: [trigger('trigger.webhook', { path: lit(PATH) })] },
      ),
    );
    rig.engine.sync();
    const reply = await gateway.call(call());
    expect(reply?.status).toBe(500);
    expect(JSON.stringify(reply?.body)).toContain('missing');
  });

  it('finds nothing for another path or another method', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    rig.add(
      program([dimTo(rig, lit(64))], {
        triggers: [trigger('trigger.webhook', { path: lit(PATH), method: lit('POST') })],
      }),
    );
    rig.engine.sync();
    expect(await gateway.call(call({ path: 'someOtherSecretPath1234' }))).toBeNull();
    expect(await gateway.call(call({ method: 'GET' }))).toBeNull();
    expect(dims(rig)).toStrictEqual([]);
  });

  it('does not even announce a call to a path no automation listens on', async () => {
    const { rig, replies } = await webhookRig();
    const emitted: unknown[] = [];
    const gateway = new WebhookGateway({
      signals: {
        emit: (signal): void => {
          emitted.push(signal);
          rig.engine.observe(signal);
        },
      },
      replies,
      clock: rig.clock,
      token: randomUUID,
    });
    gateway.attach(rig.engine);
    rig.add(
      program([dimTo(rig, lit(66))], {
        triggers: [trigger('trigger.webhook', { path: lit(PATH) })],
      }),
    );
    rig.engine.sync();
    expect(await gateway.call(call({ path: 'randomGuessedPath123456' }))).toBeNull();
    expect(emitted).toStrictEqual([]);
  });

  it('refuses a path that is too short to be a secret', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    rig.add(
      program([dimTo(rig, lit(65))], {
        triggers: [trigger('trigger.webhook', { path: lit('abc') })],
      }),
    );
    rig.engine.sync();
    expect(await gateway.call(call({ path: 'abc' }))).toBeNull();
  });

  it('lets a run that answers late still answer after the caller got its 202', async () => {
    const { rig, replies } = await webhookRig();
    const gateway = webhook(rig, replies);
    const row = rig.add(
      program(
        [
          node('pause', 'flow.wait', { duration: lit(5000) }),
          node('answer', 'http.respond', { status: lit(200) }),
          dimTo(rig, lit(66)),
        ],
        { triggers: [trigger('trigger.webhook', { path: lit(PATH) })] },
      ),
    );
    rig.engine.sync();
    expect((await gateway.call(call()))?.status).toBe(202);
    await rig.advance(6000);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]?.status).toBe('succeeded');
    expect(dims(rig)).toStrictEqual([66]);
  });
});
