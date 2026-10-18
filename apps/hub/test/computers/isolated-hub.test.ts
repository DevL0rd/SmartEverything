import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopEntries } from '../../src/node/controls/linux/desktop-entries';
import { LinuxSession } from '../../src/node/controls/linux/linux-session';
import { PulseAudio } from '../../src/node/controls/linux/pulse-audio';
import { NodeFailureError } from '../../src/node/node-failure';
import { bootServer, type Booted } from '../support/booted';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const NO_BUS = 'unix:path=/nonexistent/smarteverything-test-bus';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted | null = null;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  directory = await temporaryDirectory();
  vi.stubEnv('DBUS_SESSION_BUS_ADDRESS', NO_BUS);
});

afterEach(async () => {
  await booted?.server.stop();
  booted = null;
  await directory.remove();
  vi.unstubAllEnvs();
});

async function deviceKinds(base: Booted): Promise<readonly string[]> {
  const reply = await call(base.base, base.owner, { method: 'GET', path: '/api/devices' });
  return API_ENDPOINTS.listDevices.response.parse(reply.body).map((device) => device.kind);
}

describe.skipIf(process.platform !== 'linux')('hub on an unreachable desktop session bus', () => {
  it('reports the unreachable session bus as a failure the caller can handle', async () => {
    const session = new LinuxSession({
      audio: new PulseAudio({
        run: (): Promise<string> => Promise.resolve(''),
        probe: (): Promise<boolean> => Promise.resolve(false),
        lines: () => (): undefined => undefined,
        failed: (): undefined => undefined,
      }),
      entries: new DesktopEntries(),
      now: (): Date => new Date(),
      failed: (): undefined => undefined,
    });
    await expect(session.start(() => undefined)).rejects.toMatchObject({
      code: 'no_session',
      name: NodeFailureError.name,
    });
  });
});

describe('hub without a computer of its own', () => {
  it('opens no session bus and lists no computer until a node pairs', async () => {
    booted = await bootServer(directory.path);
    expect(logs.events()).not.toContain('node.session_unavailable');
    expect(await deviceKinds(booted)).not.toContain('computer');
  });
});

describe('browser origins of a development hub', () => {
  const WEB_DEV_ORIGIN = 'http://localhost:18696';

  function originStatus(base: Booted, origin: string): Promise<number> {
    return fetch(`${base.base}/status`, { headers: { origin } }).then((reply) => reply.status);
  }

  it('accepts a local web dev server when development origins are on', async () => {
    booted = await bootServer(directory.path, { developmentOrigins: true });
    const reply = await fetch(`${booted.base}/status`, { headers: { origin: WEB_DEV_ORIGIN } });
    expect(reply.status).toBe(200);
    expect(reply.headers.get('access-control-allow-origin')).toBe(WEB_DEV_ORIGIN);
    expect(await originStatus(booted, 'http://localhost')).toBe(403);
    expect(await originStatus(booted, 'https://localhost:18696')).toBe(403);
    expect(await originStatus(booted, 'http://evil.example.com:18696')).toBe(403);
    expect(await originStatus(booted, 'app://smarteverything')).toBe(200);
  });

  it('refuses a local web dev server by default, as a release hub does', async () => {
    booted = await bootServer(directory.path);
    expect(await originStatus(booted, WEB_DEV_ORIGIN)).toBe(403);
    expect(await originStatus(booted, 'app://smarteverything')).toBe(200);
  });
});
