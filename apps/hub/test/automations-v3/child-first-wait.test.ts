import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
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

interface Endpoint {
  readonly url: string;
  readonly held: ServerResponse[];
  readonly release: () => void;
}

async function endpoint(hold: boolean): Promise<Endpoint> {
  const held: ServerResponse[] = [];
  const server = createServer((_request, response) => {
    if (hold) held.push(response);
    else response.end('ok');
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new TypeError('no port');
  return {
    url: `http://127.0.0.1:${String(address.port)}/`,
    held,
    release: (): void => {
      for (const response of held.splice(0)) response.end('ok');
    },
  };
}

function call(url: string, key = 'call'): FlowNode {
  return node(key, 'http.request', { url: lit(url), allowLocalNetwork: lit(true) });
}

function pause(key = 'pause'): FlowNode {
  return node(key, 'flow.wait', { duration: lit(900_000) });
}

function runOf(target: string, key = 'startChild'): FlowNode {
  return node(key, 'automation.run', { automation: lit(target), wait: lit(false) });
}

function stopOf(target: string, key = 'stop'): FlowNode {
  return node(key, 'automation.stop', { automation: lit(target) });
}

function started(rig: RigV3, automationId: string): string {
  const submission = rig.engine.start(automationId, {}, null);
  if (submission.kind === 'refused') throw submission.error;
  return submission.runId;
}

function onlyRun(rig: RigV3, automationId: string): string {
  const id = rig.runs(automationId)[0]?.id;
  if (id === undefined) throw new TypeError('the automation has no run');
  return id;
}

function trace(rig: RigV3, runId: string): readonly (readonly [string, string])[] {
  return rig.nodes.forRun(runId).map((entry) => [entry.node_id, entry.status] as const);
}

describe('a child started without waiting', () => {
  it('runs until its first wait before the caller goes on to stop it', async () => {
    const rig = await rigV3();
    const server = await endpoint(true);
    const childCall = call(server.url);
    const childPause = pause();
    const child = rig.add(program([childCall, childPause]), 'Callee');
    const stop = stopOf(child.id);
    const caller = rig.add(program([runOf(child.id), stop]), 'Caller');
    rig.engine.sync();
    const callerRun = started(rig, caller.id);
    await rig.until(() => server.held.length === 1);
    await rig.settle();
    expect(trace(rig, callerRun).map(([id]) => id)).not.toContain(stop.id);
    server.release();
    await rig.until(() => rig.finished.length === 2);
    expect(trace(rig, onlyRun(rig, child.id))).toStrictEqual([
      [childCall.id, 'succeeded'],
      [childPause.id, 'cancelled'],
    ]);
    expect(rig.runs(child.id)[0]).toMatchObject({ status: 'cancelled' });
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
  });

  it('runs to its end before the caller goes on when it never waits', async () => {
    const rig = await rigV3();
    const server = await endpoint(true);
    const child = rig.add(program([call(server.url)]), 'Callee');
    const caller = rig.add(program([runOf(child.id), call(server.url, 'after')]), 'Caller');
    rig.engine.sync();
    started(rig, caller.id);
    await rig.until(() => server.held.length === 1);
    await rig.settle();
    expect(server.held).toHaveLength(1);
    server.release();
    await rig.until(() => rig.finished.length === 1);
    expect(rig.finished.map((run) => run.automationId)).toStrictEqual([child.id]);
    await rig.until(() => server.held.length === 1);
    server.release();
    await rig.until(() => rig.finished.length === 2);
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
  });

  it('lets each of two children reach its wait before the next step', async () => {
    const rig = await rigV3();
    const server = await endpoint(false);
    const first = rig.add(program([call(server.url), pause()]), 'First');
    const second = rig.add(program([call(server.url), pause()]), 'Second');
    const caller = rig.add(
      program([
        runOf(first.id, 'runFirst'),
        runOf(second.id, 'runSecond'),
        stopOf(first.id, 'stopFirst'),
        stopOf(second.id, 'stopSecond'),
      ]),
      'Caller',
    );
    rig.engine.sync();
    started(rig, caller.id);
    await rig.until(() => rig.finished.length === 3);
    for (const child of [first, second]) {
      expect(trace(rig, onlyRun(rig, child.id)).map(([, status]) => status)).toStrictEqual([
        'succeeded',
        'cancelled',
      ]);
    }
  });

  it('holds the whole chain when the child itself starts a grandchild', async () => {
    const rig = await rigV3();
    const server = await endpoint(false);
    const leaf = rig.add(program([call(server.url), pause()]), 'Leaf');
    const middle = rig.add(program([runOf(leaf.id), call(server.url), pause()]), 'Middle');
    const caller = rig.add(
      program([runOf(middle.id), stopOf(middle.id, 'stopMiddle'), stopOf(leaf.id, 'stopLeaf')]),
      'Caller',
    );
    rig.engine.sync();
    started(rig, caller.id);
    await rig.until(() => rig.finished.length === 3);
    expect(trace(rig, onlyRun(rig, middle.id)).map(([, status]) => status)).toStrictEqual([
      'succeeded',
      'succeeded',
      'cancelled',
    ]);
    expect(trace(rig, onlyRun(rig, leaf.id)).map(([, status]) => status)).toStrictEqual([
      'succeeded',
      'cancelled',
    ]);
  });

  it('does not hold the caller when the child is only queued', async () => {
    const rig = await rigV3();
    const target = rig.add(program([pause()], { policy: { mode: 'queue', max: 10 } }), 'Target');
    const caller = rig.add(program([runOf(target.id)]), 'Caller');
    rig.engine.sync();
    started(rig, target.id);
    await rig.settle();
    started(rig, caller.id);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(caller.id)[0]).toMatchObject({ status: 'succeeded' });
    expect(rig.runs(target.id).map((run) => run.status)).toStrictEqual(['waiting', 'queued']);
  });
});
