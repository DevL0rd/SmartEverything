import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningGo2rtc } from '../src/cameras/go2rtc-process';
import { stopGo2rtcForShutdown } from '../src/cameras/go2rtc-shutdown';
import { Go2rtcSupervisor, type Go2rtcConfig } from '../src/cameras/go2rtc-supervisor';
import type { RunningExtension, ServerExtension } from '../src/extensions';
import type { OpenMdns } from '../src/network/mdns';
import { bootServer, type Booted } from './support/booted';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';
import { MemoryNetwork } from './support/memory-mdns';
import { fakeGo2rtcServer, freePort, temporaryDirectory } from './support/server';

const CONFIG: Go2rtcConfig = { xiaomi: {}, candidates: [], iceServers: [] };
const SLOW_WITHDRAW_MS = 1500;

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

function supervisorStopping(stop: () => Promise<void>): Go2rtcSupervisor {
  return new Go2rtcSupervisor(
    {
      binary: '/opt/go2rtc',
      configPath: '/data/go2rtc/go2rtc.yaml',
      apiPort: 1984,
      rtspPort: 8554,
      webrtcPort: 8555,
      log: testLogger('go2rtc'),
      exited: (): void => undefined,
    },
    (launch) =>
      Promise.resolve<RunningGo2rtc>({
        baseUrl: 'http://127.0.0.1:1984',
        username: 'hub',
        password: launch.password,
        expectStop: (): void => undefined,
        stop,
      }),
  );
}

async function pidRecordingGo2rtc(directory: string, pidFile: string): Promise<string> {
  const fake = await fakeGo2rtcServer(directory);
  const path = join(directory, 'go2rtc-with-pid');
  await writeFile(path, ['#!/bin/sh', `echo $$ > "${pidFile}"`, `exec "${fake}" "$@"`].join('\n'));
  await chmod(path, 0o700);
  return path;
}

function slowStoppingExtension(delayMs: number): ServerExtension {
  return (): Promise<RunningExtension> =>
    Promise.resolve({
      endpoints: {},
      routes: [],
      stop: () => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
    });
}

function slowWithdraw(open: OpenMdns, delayMs: number): OpenMdns {
  return (failed) => {
    const mdns = open(failed);
    return {
      ...mdns,
      close: async (): Promise<void> => {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        await mdns.close();
      },
    };
  };
}

describe('stopping go2rtc for hub shutdown', () => {
  it('stops the running supervisor once and waits for it', async () => {
    let finish: () => void = () => undefined;
    let stops = 0;
    const supervisor = supervisorStopping(
      () =>
        new Promise<void>((resolve) => {
          stops += 1;
          finish = resolve;
        }),
    );
    await supervisor.start(CONFIG);
    const stopping = stopGo2rtcForShutdown(supervisor, testLogger('go2rtc'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(stops).toBe(1);
    expect(supervisor.isRunning()).toBe(false);
    let settled = false;
    void stopping.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    finish();
    await stopping;
    expect(settled).toBe(true);
    expect(logs.events()).not.toContain('go2rtc.stop_failed');
  });

  it('does nothing and logs nothing when go2rtc is not running', async () => {
    const supervisor = supervisorStopping(() =>
      Promise.reject(new Error('go2rtc was not launched')),
    );
    await expect(stopGo2rtcForShutdown(supervisor, testLogger('go2rtc'))).resolves.toBeUndefined();
    expect(supervisor.isRunning()).toBe(false);
    expect(logs.records).toStrictEqual([]);
  });

  it('keeps a genuinely failed stop visible on the go2rtc logger', async () => {
    const supervisor = supervisorStopping(() => Promise.reject(new Error('kill failed')));
    await supervisor.start(CONFIG);
    await expect(stopGo2rtcForShutdown(supervisor, testLogger('go2rtc'))).resolves.toBeUndefined();
    const failures = logs.records.filter((record) => record.event === 'go2rtc.stop_failed');
    expect(failures.map((record) => record.level)).toStrictEqual(['error']);
    expect(failures.map((record) => record.scope)).toStrictEqual(['hub.go2rtc']);
    expect(failures.map((record) => record.failure?.message)).toStrictEqual(['kill failed']);
  });
});

describe('hub shutdown with go2rtc running', () => {
  let directory: { path: string; remove: () => Promise<void> } | null = null;
  let booted: Booted | null = null;

  afterEach(async () => {
    await booted?.server.stop();
    booted = null;
    await directory?.remove();
    directory = null;
  });

  it('marks the expected stop before a slow shutdown, so no death or fatal is reported', async () => {
    directory = await temporaryDirectory();
    const apiPort = await freePort();
    const pidFile = join(directory.path, 'go2rtc.pid');
    const fatals: Error[] = [];
    const network = new MemoryNetwork();
    booted = await bootServer(directory.path, {
      lan: { port: await freePort(), host: '127.0.0.1', advertise: true },
      mdns: slowWithdraw(network.host('192.0.2.2'), SLOW_WITHDRAW_MS),
      go2rtcBinary: await pidRecordingGo2rtc(directory.path, pidFile),
      go2rtcApiPort: apiPort,
      extensions: [slowStoppingExtension(SLOW_WITHDRAW_MS)],
      fatal: (cause: Error): void => {
        fatals.push(cause);
      },
    });
    const api = `http://127.0.0.1:${String(apiPort)}/api/streams`;
    expect((await fetch(api)).status).toBe(200);
    process.kill(Number(await readFile(pidFile, 'utf8')), 'SIGTERM');
    await booted.server.stop();
    booted = null;
    expect(
      logs.records.filter((record) => record.failure?.name === 'Go2rtcExitedError'),
    ).toStrictEqual([]);
    expect(logs.events()).not.toContain('go2rtc.died');
    expect(logs.events()).not.toContain('service.fatal');
    expect(fatals).toStrictEqual([]);
    expect(logs.records.filter((record) => record.event === 'go2rtc.stopping')).toHaveLength(1);
    const marked = logs.events().indexOf('go2rtc.stopping');
    expect(marked).toBeLessThan(logs.events().indexOf('discovery.stopping'));
    await expect(fetch(api)).rejects.toThrow();
  });

  it('stops a running go2rtc on purpose before the store closes', async () => {
    directory = await temporaryDirectory();
    const apiPort = await freePort();
    const fatals: Error[] = [];
    booted = await bootServer(directory.path, {
      go2rtcApiPort: apiPort,
      fatal: (cause: Error): void => {
        fatals.push(cause);
      },
    });
    const api = `http://127.0.0.1:${String(apiPort)}/api/streams`;
    expect((await fetch(api)).status).toBe(200);
    await booted.server.stop();
    booted = null;
    expect(logs.records.filter((record) => record.event === 'go2rtc.stopping')).toHaveLength(1);
    expect(
      logs.records
        .filter((record) => record.event === 'go2rtc.exited')
        .map((record) => record.payload['expected']),
    ).toStrictEqual([true]);
    expect(logs.events()).not.toContain('go2rtc.died');
    expect(fatals).toStrictEqual([]);
    await expect(fetch(api)).rejects.toThrow();
  });
});
