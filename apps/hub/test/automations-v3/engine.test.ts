import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeSetups,
  wired,
  lit,
  node,
  program,
  rigV3,
  SECRET_ID,
  SECRET_VALUE,
  trigger,
} from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

const REMOTE = randomUUID();

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

function cycleProgram(lamp: string): ReturnType<typeof program> {
  return program(
    [
      node('cycle', 'var.change', {
        source: lit('automation'),
        name: lit('level'),
        op: lit('next'),
        steps: lit([1, 25, 50, 75, 100]),
        edge: lit('wrap'),
      }),
      node('setLights', 'device.set', {
        target: lit({ device: lamp }),
        control: lit('brightness'),
        to: wired('cycle.value'),
      }),
    ],
    {
      triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })],
      variables: [{ name: 'level', type: { t: 'number' }, initial: lit(100), persist: true }],
      policy: { mode: 'queue', max: 10 },
    },
  );
}

function brightnesses(rig: RigV3): unknown[] {
  return rig.home.adapter.executed.map((command) => command.value);
}

describe('the V3 engine end to end', () => {
  it('runs the two node press-cycles-brightness example from the language document', async () => {
    const rig = await rigV3();
    const row = rig.add(cycleProgram(rig.home.lampId));
    expect(rig.engine.sync()).toMatchObject({ loaded: 1, unchanged: 0, removed: 0 });
    for (let press = 0; press < 3; press += 1) {
      rig.press(REMOTE, 'single');
      await rig.until(() => rig.finished.length === press + 1);
    }
    expect(brightnesses(rig)).toStrictEqual([1, 25, 50]);
    expect(rig.runs(row.id).map((run) => run.status)).toStrictEqual([
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(rig.owned.list(row.id).map((value) => value.content.value)).toStrictEqual([50]);
  });

  it('stores a node record for each value a run reads', async () => {
    const rig = await rigV3();
    const row = rig.add(
      program([
        node('dice', 'random.number', { min: lit(10), max: lit(10), integer: lit(true) }),
        node('setLights', 'device.set', {
          target: lit({ device: rig.home.lampId }),
          control: lit('brightness'),
          to: wired('dice.value'),
        }),
      ]),
    );
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    const stored = rig.nodes.forRun(rig.runs(row.id)[0]?.id ?? '');
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      status: 'succeeded',
      output_preview: { value: { value: 10 } },
    });
    expect(stored[1]).toMatchObject({ status: 'succeeded', output_preview: null });
    expect(stored[1]?.node_id).not.toBe(stored[0]?.node_id);
  });

  it('keeps a durable wait across a simulated restart and finishes the run afterwards', async () => {
    const rig = await rigV3();
    const row = rig.add(
      program([
        node('pause', 'flow.wait', { duration: lit(600_000) }),
        node('dim', 'device.set', {
          target: lit({ device: rig.home.lampId }),
          control: lit('brightness'),
          to: lit(80),
        }),
      ]),
    );
    rig.engine.sync();
    const started = rig.engine.start(row.id, {}, null);
    await rig.settle();
    expect(started.kind).toBe('started');
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'waiting' });
    expect(brightnesses(rig)).toStrictEqual([]);
    rig.restart();
    rig.engine.sync();
    expect(rig.engine.boot()).toStrictEqual({ resumed: 1, cancelled: 0, interrupted: 0 });
    await rig.advance(599_000);
    expect(brightnesses(rig)).toStrictEqual([]);
    await rig.advance(2000);
    await rig.until(() => rig.finished.length === 1);
    expect(brightnesses(rig)).toStrictEqual([80]);
    expect(rig.runs(row.id)).toHaveLength(1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded', state: null });
  });

  it('sends a secret with an http request and never records its value', async () => {
    const rig = await rigV3();
    const seen: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      seen.push(request.headers.authorization);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ fine: true }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('The server has no port.');
    const row = rig.add(
      program([
        node('call', 'http.request', {
          url: lit(`http://127.0.0.1:${String(address.port)}/hook`),
          auth: lit({ secret: SECRET_ID, scheme: 'bearer' }),
          allowLocalNetwork: lit(true),
        }),
      ]),
    );
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    expect(seen).toStrictEqual([`Bearer ${SECRET_VALUE}`]);
    expect(rig.finished[0]).toMatchObject({ outcome: 'succeeded' });
    expect(rig.dump()).not.toContain(SECRET_VALUE);
    expect(rig.dump()).toContain(SECRET_ID);
  });

  it('finishes a waiting parent when its queued child is dropped', async () => {
    const rig = await rigV3();
    const target = rig.add(
      program([node('pause', 'flow.wait', { duration: lit(900_000) })], {
        policy: { mode: 'queue', max: 10 },
      }),
      'Target',
    );
    const parent = rig.add(
      program([node('child', 'automation.run', { automation: lit(target.id), wait: lit(true) })]),
      'Parent',
    );
    rig.engine.sync();
    rig.engine.start(target.id, {}, null);
    await rig.settle();
    rig.engine.start(parent.id, {}, null);
    await rig.settle();
    expect(rig.runs(parent.id)[0]).toMatchObject({ status: 'running' });
    rig.setEnabled(target.id, false);
    rig.engine.reload(target.id);
    await rig.until(() => rig.runs(parent.id)[0]?.status !== 'running');
    expect(rig.runs(parent.id)[0]).toMatchObject({ status: 'failed' });
  });

  it('reloads only the automations that changed and cancels lasting runs on disable', async () => {
    const rig = await rigV3();
    const waiting = rig.add(
      program([node('pause', 'flow.wait', { duration: lit(900_000) })]),
      'Waits',
    );
    rig.add(cycleProgram(rig.home.lampId), 'Cycles');
    expect(rig.engine.sync()).toMatchObject({ loaded: 2, unchanged: 0 });
    expect(rig.engine.sync()).toMatchObject({ loaded: 0, unchanged: 2 });
    rig.engine.start(waiting.id, {}, null);
    await rig.settle();
    expect(rig.engine.driver.active).toBe(1);
    rig.setEnabled(waiting.id, false);
    rig.engine.reload(waiting.id);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.finished[0]).toMatchObject({ outcome: 'cancelled' });
    expect(rig.engine.automations).toHaveLength(1);
    expect(rig.engine.sync()).toMatchObject({ loaded: 0, removed: 0, unchanged: 2 });
  });

  it('tells when a run finished and stops every run of an automation', async () => {
    const rig = await rigV3();
    const waiting = rig.add(program([node('pause', 'flow.wait', { duration: lit(900_000) })]));
    rig.engine.sync();
    const started = rig.engine.start(waiting.id, {}, null);
    if (started.kind === 'refused') throw started.error;
    const done = rig.engine.finished(started.runId);
    await rig.settle();
    expect(rig.engine.cancelAutomation(waiting.id, 'user_stop')).toBe(1);
    await expect(done).resolves.toStrictEqual({});
    expect(rig.runs(waiting.id)[0]).toMatchObject({ status: 'cancelled' });
  });
});
