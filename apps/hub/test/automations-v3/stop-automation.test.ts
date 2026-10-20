import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { AutomationRowV3, AutomationV3, FlowNode } from '@smarteverything/domain';
import { stopAutomation } from '../../src/automations/engine-v3-stop';
import { closeSetups, lit, node, program, rigV3 } from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

const FLAG = { name: 'flag', type: { t: 'number' }, initial: lit(0), persist: true } as const;

function stopper(rig: RigV3, target: string): AutomationRowV3 {
  return rig.add(
    program([node('stop', 'automation.stop', { automation: lit(target) })]),
    'Stopper',
  );
}

function startedRun(rig: RigV3, automationId: string): string {
  const started = rig.engine.start(automationId, {}, null);
  if (started.kind === 'refused') throw started.error;
  return started.runId;
}

function settledProgram(body: readonly FlowNode[]): AutomationV3 {
  return program(body, { variables: [FLAG] });
}

function guardedWait(): AutomationV3 {
  return settledProgram([
    node(
      'guard',
      'flow.try',
      {},
      {
        scopes: {
          try: { nodes: [node('pause', 'flow.wait', { duration: lit(900_000) })] },
          finally: {
            nodes: [
              node('mark', 'var.set', {
                source: lit('automation'),
                name: lit('flag'),
                to: lit(1),
              }),
            ],
          },
        },
      },
    ),
  ]);
}

async function hangingUrl(): Promise<string> {
  const server = createServer(() => undefined);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new TypeError('no port');
  return `http://127.0.0.1:${String(address.port)}/`;
}

describe('the stop automation effect', () => {
  it('stops a parked run, runs its finally block and ends the run cancelled', async () => {
    const rig = await rigV3();
    const target = rig.add(guardedWait(), 'Target');
    const caller = stopper(rig, target.id);
    rig.engine.sync();
    startedRun(rig, target.id);
    await rig.settle();
    expect(rig.engine.driver.active).toBe(1);
    startedRun(rig, caller.id);
    await rig.until(() => rig.finished.length === 2);
    expect(rig.runs(target.id)[0]).toMatchObject({ status: 'cancelled' });
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
    expect(rig.owned.list(target.id).map((value) => value.content.value)).toStrictEqual([1]);
    expect(rig.engine.driver.active).toBe(0);
  });

  it('stops a run whose effect is still in flight', async () => {
    const rig = await rigV3();
    const url = await hangingUrl();
    const target = rig.add(
      program([node('call', 'http.request', { url: lit(url), allowLocalNetwork: lit(true) })]),
      'Target',
    );
    const caller = stopper(rig, target.id);
    rig.engine.sync();
    startedRun(rig, target.id);
    await rig.settle();
    expect(rig.runs(target.id)[0]).toMatchObject({ status: 'running' });
    startedRun(rig, caller.id);
    await rig.until(() => rig.finished.length === 2);
    expect(rig.runs(target.id)[0]).toMatchObject({ status: 'cancelled' });
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
  });

  it('drops the queued runs together with the running one', async () => {
    const rig = await rigV3();
    const target = rig.add(
      program([node('pause', 'flow.wait', { duration: lit(900_000) })], {
        policy: { mode: 'queue', max: 10 },
      }),
      'Target',
    );
    const caller = stopper(rig, target.id);
    rig.engine.sync();
    const active = startedRun(rig, target.id);
    const queued = startedRun(rig, target.id);
    await rig.settle();
    expect(rig.records.byId(queued).status).toBe('queued');
    startedRun(rig, caller.id);
    await rig.until(() => rig.finished.length >= 2);
    await rig.settle();
    expect(rig.records.byId(active).status).toBe('cancelled');
    expect(rig.records.byId(queued).status).toBe('cancelled');
    expect(rig.engine.driver.active).toBe(0);
  });

  it('stops its own automation without taking other automations down', async () => {
    const rig = await rigV3();
    const other = rig.add(
      program([node('pause', 'flow.wait', { duration: lit(900_000) })]),
      'Bystander',
    );
    const self = rig.add(program([node('pause', 'flow.wait', { duration: lit(1) })]), 'Self');
    rig.programs.replace(self.id, {
      program: program([
        node('stop', 'automation.stop', { automation: lit(self.id) }),
        node('after', 'flow.wait', { duration: lit(900_000) }),
      ]),
      layout: self.layout,
      expectedRevision: self.revision,
      planHash: 'b'.repeat(64),
      author: null,
    });
    rig.engine.sync();
    startedRun(rig, other.id);
    startedRun(rig, self.id);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(self.id)[0]).toMatchObject({ status: 'cancelled' });
    expect(rig.runs(other.id)[0]).toMatchObject({ status: 'waiting' });
  });

  it('stops only the runs of one control key and records the key on the run', async () => {
    const rig = await rigV3();
    const pause = [node('pause', 'flow.wait', { duration: lit(900_000) })];
    const red = rig.add(program(pause, { policy: { mode: 'single', key: 'red' } }), 'Red');
    const blue = rig.add(program(pause, { policy: { mode: 'single', key: 'blue' } }), 'Blue');
    const caller = rig.add(
      program([node('stop', 'automation.stop', { automation: lit(red.id), key: lit('blue') })]),
      'Keyed stopper',
    );
    rig.engine.sync();
    const redRun = startedRun(rig, red.id);
    const blueRun = startedRun(rig, blue.id);
    await rig.settle();
    expect(rig.records.byId(redRun).control_key).toBe('red');
    expect(rig.records.byId(blueRun).control_key).toBe('blue');
    startedRun(rig, caller.id);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.records.byId(redRun).status).toBe('waiting');
    expect(rig.engine.cancelAutomation(red.id, 'user_stop', 'red')).toBe(1);
    await rig.settle();
    expect(rig.records.byId(redRun).status).toBe('cancelled');
    expect(rig.records.byId(blueRun).status).toBe('waiting');
  });

  it('succeeds when the automation has nothing running', async () => {
    const rig = await rigV3();
    const idle = rig.add(program([node('pause', 'flow.wait', { duration: lit(1) })]), 'Idle');
    const caller = stopper(rig, idle.id);
    rig.engine.sync();
    startedRun(rig, caller.id);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
  });
});

describe('the stop parameters', () => {
  it('pass a control key on to the cancel path', () => {
    const cancelled: string[] = [];
    const result = stopAutomation({ automation: 'a', key: 'k' }, (id, reason, key) => {
      cancelled.push(`${id}:${reason}:${String(key)}`);
      return 1;
    });
    expect(result).toStrictEqual({ ok: true, value: {} });
    expect(cancelled).toStrictEqual(['a:user_stop:k']);
  });

  it('refuse a missing automation and cancel with the user reason otherwise', () => {
    expect(stopAutomation({}, () => 0)).toMatchObject({ ok: false, class: 'Invalid' });
    const reasons: string[] = [];
    const result = stopAutomation({ automation: 'a', key: null }, (id, reason) => {
      reasons.push(`${id}:${reason}`);
      return 1;
    });
    expect(result).toStrictEqual({ ok: true, value: {} });
    expect(reasons).toStrictEqual(['a:user_stop']);
  });
});
