import { once } from 'node:events';
import { API_ERROR, ApiError } from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningExtension } from '../../src/extensions';
import type { RawRoute } from '../../src/server/http-server';
import { bootServer, type Booted } from '../support/booted';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { temporaryDirectory } from '../support/server';

const UPSTREAM_ROUTE = '/test/typed-failure';
const CRASH_ROUTE = '/test/unexpected-failure';
const ABORT_ROUTE = '/test/disconnect';
const DIRECT_ROUTE = '/test/direct-failure';
const BODY_SAMPLE = 'sample-private-body';
const PATH_SAMPLE = 'sample-private-path';
const FAILURE_SAMPLE = 'sample-private-failure';

function failureRoute(path: string, cause: Error): RawRoute {
  return {
    method: 'GET',
    path,
    handle: () => Promise.reject(cause),
  };
}

const routes: readonly RawRoute[] = [
  failureRoute(UPSTREAM_ROUTE, new ApiError('upstream_failed', FAILURE_SAMPLE)),
  failureRoute(CRASH_ROUTE, new Error('Unexpected fixture failure')),
  {
    method: 'GET',
    path: ABORT_ROUTE,
    handle: async (_request, response): Promise<void> => {
      const closed = once(response, 'close');
      response.destroy();
      await closed;
      throw new DOMException('Fixture request stopped', 'AbortError');
    },
  },
  {
    method: 'GET',
    path: DIRECT_ROUTE,
    handle: (_request, response): Promise<void> => {
      response.writeHead(503);
      response.end();
      return Promise.resolve();
    },
  },
];

let fixture: Awaited<ReturnType<typeof temporaryDirectory>>;
let running: Booted;
let logs: CapturedLogs;

beforeEach(async () => {
  fixture = await temporaryDirectory();
  logs = captureLogs();
  running = await bootServer(fixture.path, {
    extensions: [
      (): Promise<RunningExtension> =>
        Promise.resolve({ routes, endpoints: {}, stop: () => Promise.resolve() }),
    ],
  });
});

afterEach(async () => {
  await running.server.stop();
  await fixture.remove();
  Logger.reset();
});

function recordedFor(path: string): readonly LogRecord[] {
  return logs.records.filter(({ payload }) => payload['route'] === `GET ${path}`);
}

describe('HTTP failure logging', () => {
  it('keeps malformed body text and unmatched path segments out of errors and logs', async () => {
    const malformed = await fetch(`${running.base}/api/rooms`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${running.owner}`,
        'content-type': 'application/json',
      },
      body: BODY_SAMPLE,
    });
    expect(malformed.status).toBe(400);
    const rejected = API_ERROR.parse(await malformed.json());
    expect(rejected.error.code).toBe('invalid_request');
    expect(rejected.error.message).not.toContain(BODY_SAMPLE);
    const unmatched = await fetch(`${running.base}/${PATH_SAMPLE}`);
    expect(unmatched.status).toBe(404);
    expect(await unmatched.text()).not.toContain(PATH_SAMPLE);
    expect(logs.records.find(({ payload }) => payload['route'] === 'unmatched')).toMatchObject({
      event: 'request.completed',
      payload: { route: 'unmatched', status: 404 },
    });
    const serialized = JSON.stringify(logs.records);
    expect(serialized).not.toContain(BODY_SAMPLE);
    expect(serialized).not.toContain(PATH_SAMPLE);
  });

  it('records typed and directly sent 5xx responses once at error level', async () => {
    const typed = await fetch(`${running.base}${UPSTREAM_ROUTE}`);
    expect(typed.status).toBe(502);
    await typed.text();
    const typedLogs = recordedFor(UPSTREAM_ROUTE);
    expect(typedLogs).toHaveLength(1);
    expect(typedLogs[0]).toMatchObject({
      event: 'request.failed',
      level: 'error',
      payload: { status: 502, errorCode: 'upstream_failed' },
    });
    expect(JSON.stringify(typedLogs)).not.toContain(FAILURE_SAMPLE);
    const direct = await fetch(`${running.base}${DIRECT_ROUTE}`);
    expect(direct.status).toBe(503);
    await direct.text();
    expect(recordedFor(DIRECT_ROUTE)).toEqual([
      expect.objectContaining({ event: 'request.failed', level: 'error' }),
    ]);
  });

  it('retains unexpected exception diagnostics without recording a second failure', async () => {
    const crashed = await fetch(`${running.base}${CRASH_ROUTE}`);
    expect(crashed.status).toBe(500);
    expect(await crashed.text()).not.toContain('Unexpected fixture failure');
    const records = recordedFor(CRASH_ROUTE);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: 'request.crashed',
      level: 'exception',
      failure: { message: 'Unexpected fixture failure' },
    });
  });

  it('counts a closed client transport as a debug abort, not a crash', async () => {
    await expect(fetch(`${running.base}${ABORT_ROUTE}`)).rejects.toBeInstanceOf(Error);
    expect(recordedFor(ABORT_ROUTE)).toEqual([
      expect.objectContaining({ event: 'request.aborted', level: 'debug' }),
    ]);
  });
});
