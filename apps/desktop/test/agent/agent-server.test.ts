import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { until } from '../support/wait.js';
import type { CaptureTarget, ComputerCapture, MachineOpenTarget } from '@smarteverything/domain';
import { AgentFailure, type AgentActions } from '../../src/agent/agent-actions.js';
import { AgentServer } from '../../src/agent/agent-server.js';

const LINE = z.record(z.string(), z.unknown());
const TOKEN = 'k'.repeat(48);
const PICTURE: ComputerCapture = {
  mimeType: 'image/jpeg',
  data: 'AA==',
  width: 1,
  height: 1,
  at: '2026-10-18T10:00:00.000Z',
};

interface Rig {
  readonly calls: string[];
  readonly rings: (() => void)[];
  readonly send: (message: object | string, lines?: number) => Promise<Record<string, unknown>[]>;
}

let directory: string;
let server: AgentServer | null = null;

function actions(calls: string[], rings: (() => void)[], fail: Error | null): AgentActions {
  return {
    open: (target: MachineOpenTarget): Promise<void> => {
      calls.push(`open ${target.kind}`);
      return fail === null ? Promise.resolve() : Promise.reject(fail);
    },
    ring: (on: boolean, ended: () => void): Promise<void> => {
      calls.push(`ring ${String(on)}`);
      if (on) rings.push(ended);
      else for (const done of rings.splice(0)) done();
      return Promise.resolve();
    },
    capture: (target: CaptureTarget): Promise<ComputerCapture> => {
      calls.push(`capture ${target}`);
      return fail === null ? Promise.resolve(PICTURE) : Promise.reject(fail);
    },
  };
}

async function rig(fail: Error | null = null): Promise<Rig> {
  const calls: string[] = [];
  const rings: (() => void)[] = [];
  const socket = join(directory, 'agent.sock');
  server = new AgentServer(TOKEN, actions(calls, rings, fail));
  await server.listen(socket);
  return {
    calls,
    rings,
    send: (message, count = Infinity) =>
      new Promise((resolve, reject) => {
        const lines: Record<string, unknown>[] = [];
        let buffer = '';
        const connection = createConnection(socket);
        connection.setEncoding('utf8');
        connection.on('connect', () => {
          connection.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
        });
        connection.on('data', (chunk: string) => {
          buffer += chunk;
          for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
            lines.push(LINE.parse(JSON.parse(buffer.slice(0, end))));
            buffer = buffer.slice(end + 1);
          }
          if (lines.length >= count) resolve(lines);
        });
        connection.on('close', () => {
          resolve(lines);
        });
        connection.on('error', reject);
      }),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-server-'));
});

afterEach(async () => {
  await server?.close();
  server = null;
  await rm(directory, { recursive: true, force: true });
});

function request(operation: object, token = TOKEN): object {
  return { id: 'r1', token, operation };
}

describe('the session agent server', () => {
  it('answers a ping and does nothing else', async () => {
    const test = await rig();
    expect(await test.send(request({ op: 'ping' }))).toEqual([
      { type: 'reply', id: 'r1', ok: true, capture: null },
    ]);
    expect(test.calls).toEqual([]);
  });

  it('refuses a wrong token without running the operation', async () => {
    const test = await rig();
    const replies = await test.send(
      request({ op: 'open', target: { kind: 'path', path: '/a' } }, 'x'),
    );
    expect(replies).toEqual([
      {
        type: 'reply',
        id: 'r1',
        ok: false,
        code: 'unauthorized',
        message: 'The token does not match.',
      },
    ]);
    expect(test.calls).toEqual([]);
  });

  it('refuses a request it cannot read and one that is not a known operation', async () => {
    const test = await rig();
    const garbage = await test.send('{not json');
    expect(garbage[0]).toMatchObject({ ok: false, code: 'invalid_request' });
    const unknown = await test.send(request({ op: 'format_disk' }));
    expect(unknown[0]).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(test.calls).toEqual([]);
  });

  it('opens a target and returns a capture', async () => {
    const test = await rig();
    await test.send(request({ op: 'open', target: { kind: 'url', url: 'https://example.com/a' } }));
    const captured = await test.send(request({ op: 'capture', target: 'screen' }));
    expect(captured).toEqual([{ type: 'reply', id: 'r1', ok: true, capture: PICTURE }]);
    expect(test.calls).toEqual(['open url', 'capture screen']);
  });

  it('turns an action failure into a failure reply with its code', async () => {
    const test = await rig(new AgentFailure('not_supported', 'Only the whole screen.'));
    const replies = await test.send(request({ op: 'capture', target: 'focused' }));
    expect(replies).toEqual([
      {
        type: 'reply',
        id: 'r1',
        ok: false,
        code: 'not_supported',
        message: 'Only the whole screen.',
      },
    ]);
  });

  it('keeps a ringing connection open and sends ring_ended when the ring stops', async () => {
    const test = await rig();
    const ringing = test.send(request({ op: 'ring', on: true }), 2);
    await until(() => test.rings.length === 1);
    const later = await test.send({ id: 'r2', token: TOKEN, operation: { op: 'ring', on: false } });
    expect(later[0]).toMatchObject({ id: 'r2', ok: true });
    const lines = await ringing;
    expect(lines).toEqual([
      { type: 'reply', id: 'r1', ok: true, capture: null },
      { type: 'event', event: 'ring_ended' },
    ]);
    expect(test.calls).toEqual(['ring true', 'ring false']);
  });
});

describe('a failing shell', () => {
  it('answers failed with the message of what went wrong', async () => {
    const test = await rig(new Error('shell refused'));
    const replies = await test.send(
      request({ op: 'open', target: { kind: 'path', path: '/missing' } }),
    );
    expect(replies[0]).toMatchObject({ ok: false, code: 'failed', message: 'shell refused' });
  });
});
