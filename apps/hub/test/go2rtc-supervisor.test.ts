import { beforeEach, describe, expect, it } from 'vitest';
import type { Go2rtcLaunch, RunningGo2rtc } from '../src/cameras/go2rtc-process';
import {
  Go2rtcSupervisor,
  xiaomiLoginsOf,
  type Go2rtcConfig,
} from '../src/cameras/go2rtc-supervisor';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

interface Launches {
  readonly started: Go2rtcLaunch[];
  readonly stopped: string[];
  readonly expected: string[];
}

function runningOf(
  launch: Go2rtcLaunch,
  launches: Launches,
  stop: () => Promise<void>,
): RunningGo2rtc {
  let expected = false;
  return {
    baseUrl: 'http://127.0.0.1:1984',
    username: 'hub',
    password: launch.password,
    expectStop: (): void => {
      if (expected) return;
      expected = true;
      launches.expected.push('expected');
    },
    stop: (): Promise<void> => {
      launches.stopped.push('stopped');
      return stop();
    },
  };
}

function launcher(launches: Launches): (launch: Go2rtcLaunch) => Promise<RunningGo2rtc> {
  return (launch) => {
    launches.started.push(launch);
    return Promise.resolve(runningOf(launch, launches, () => Promise.resolve()));
  };
}

const OPTIONS = {
  binary: '/opt/go2rtc',
  configPath: '/data/go2rtc/go2rtc.yaml',
  apiPort: 1984,
  rtspPort: 8554,
  webrtcPort: 8555,
  exited: (): void => undefined,
};

function config(xiaomi: Readonly<Record<string, string>>): Go2rtcConfig {
  return { xiaomi, candidates: [], iceServers: [] };
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

describe('xiaomiLoginsOf', () => {
  it('maps the Xiaomi user id to its passToken for go2rtc', () => {
    expect(
      xiaomiLoginsOf({
        label: 'x',
        secrets: { userId: '1234567', passToken: 'token', region: 'de' },
      }),
    ).toStrictEqual({ '1234567': 'token' });
  });

  it('has no logins without an account', () => {
    expect(xiaomiLoginsOf(null)).toStrictEqual({});
  });

  it('refuses an account without a user id or passToken, without echoing secrets', () => {
    expect(() => xiaomiLoginsOf({ label: 'x', secrets: { userId: '1', passToken: '' } })).toThrow(
      'The stored Xiaomi account has no usable userId and passToken for go2rtc; 1 field(s) are missing or empty.',
    );
  });
});

describe('Go2rtcSupervisor', () => {
  it('starts go2rtc with one stable password and the given Xiaomi logins', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() }, launcher(launches));
    const running = await supervisor.start(config({ '1': 'a' }));
    expect(running.password).toBe(supervisor.password);
    expect(supervisor.password).toMatch(/^[0-9a-f]{48}$/);
    expect(launches.started.map((launch) => launch.xiaomi)).toStrictEqual([{ '1': 'a' }]);
  });

  it('restarts only when the Xiaomi logins change, and never logs them', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() }, launcher(launches));
    await supervisor.start(config({ '1': 'a' }));
    expect(await supervisor.apply({ xiaomi: { '1': 'a' } })).toBe(false);
    expect(await supervisor.apply({ xiaomi: { '1': 'b' } })).toBe(true);
    expect(await supervisor.apply({ xiaomi: { '1': 'b', '2': 'c' } })).toBe(true);
    expect(await supervisor.apply({ xiaomi: {} })).toBe(true);
    expect(launches.stopped).toHaveLength(3);
    expect(launches.started.map((launch) => launch.xiaomi)).toStrictEqual([
      { '1': 'a' },
      { '1': 'b' },
      { '1': 'b', '2': 'c' },
      {},
    ]);
    expect(new Set(launches.started.map((launch) => launch.password)).size).toBe(1);
    expect(JSON.stringify(logs.records)).not.toMatch(/"(a|b|c)"/);
  });

  it('applies overlapping changes one after another', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() }, launcher(launches));
    await supervisor.start(config({}));
    const results = await Promise.all([
      supervisor.apply({ xiaomi: { '1': 'a' } }),
      supervisor.apply({ xiaomi: { '1': 'a' } }),
    ]);
    expect(results).toStrictEqual([true, false]);
    expect(launches.started).toHaveLength(2);
  });

  it('reports a failed restart as an exit and keeps applying later changes', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const start = launcher(launches);
    let fail = false;
    const exits: string[] = [];
    const supervisor = new Go2rtcSupervisor(
      {
        ...OPTIONS,
        log: testLogger(),
        exited: (cause): void => {
          exits.push(cause.message);
        },
      },
      (launch) => (fail ? Promise.reject(new Error('port in use')) : start(launch)),
    );
    await supervisor.start(config({}));
    fail = true;
    await expect(supervisor.apply({ xiaomi: { '1': 'a' } })).rejects.toThrow('port in use');
    fail = false;
    await expect(supervisor.apply({ xiaomi: { '1': 'b' } })).rejects.toThrow(
      'go2rtc is not running; it must be started before it is restarted or stopped.',
    );
    expect(exits).toStrictEqual([
      'port in use',
      'go2rtc is not running; it must be started before it is restarted or stopped.',
    ]);
    await supervisor.start(config({}));
    await expect(supervisor.apply({ xiaomi: { '1': 'b' } })).resolves.toBe(true);
  });

  it('restarts with new WebRTC candidates and ICE servers, and not for the same ones', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() }, launcher(launches));
    await supervisor.start(config({ '1': 'a' }));
    expect(supervisor.isRunning()).toBe(true);
    expect(await supervisor.apply({ candidates: [] })).toBe(false);
    const iceServers = [{ urls: ['stun:stun.example.com:3478'] }];
    expect(await supervisor.apply({ candidates: ['192.168.1.2:8555'], iceServers })).toBe(true);
    expect(launches.started.at(-1)).toMatchObject({
      xiaomi: { '1': 'a' },
      candidates: ['192.168.1.2:8555'],
      iceServers,
    });
    await supervisor.stop();
    expect(supervisor.isRunning()).toBe(false);
  });

  it('refuses a change before it was ever started', async () => {
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() });
    await expect(supervisor.apply({ candidates: [] })).rejects.toThrow('go2rtc is not running');
  });

  it('refuses to stop when it is not running', async () => {
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() });
    await expect(supervisor.stop()).rejects.toThrow('go2rtc is not running');
  });

  it('marks the running go2rtc as expected to stop without stopping it', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const supervisor = new Go2rtcSupervisor({ ...OPTIONS, log: testLogger() }, launcher(launches));
    await supervisor.start(config({}));
    supervisor.expectStop();
    expect(launches.expected).toStrictEqual(['expected']);
    expect(launches.stopped).toStrictEqual([]);
    expect(supervisor.isRunning()).toBe(true);
  });

  it('drops a change requested during shutdown and still stops the running go2rtc', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    const exits: string[] = [];
    const supervisor = new Go2rtcSupervisor(
      {
        ...OPTIONS,
        log: testLogger(),
        exited: (cause): void => {
          exits.push(cause.message);
        },
      },
      launcher(launches),
    );
    await supervisor.start(config({}));
    supervisor.expectStop();
    expect(await supervisor.apply({ xiaomi: { '1': 'a' } })).toBe(false);
    expect(launches.started).toHaveLength(1);
    expect(exits).toStrictEqual([]);
    await supervisor.stop();
    expect(launches.stopped).toStrictEqual(['stopped']);
    expect(launches.started).toHaveLength(1);
    expect(supervisor.isRunning()).toBe(false);
  });

  it('stops a go2rtc that an in-flight restart started after the shutdown stop was requested', async () => {
    const launches: Launches = { started: [], stopped: [], expected: [] };
    let hold = false;
    let release: () => void = () => undefined;
    const supervisor = new Go2rtcSupervisor(
      { ...OPTIONS, log: testLogger() },
      (launch): Promise<RunningGo2rtc> => {
        launches.started.push(launch);
        const running = runningOf(launch, launches, () => Promise.resolve());
        if (!hold) return Promise.resolve(running);
        return new Promise<RunningGo2rtc>((resolve) => {
          release = (): void => {
            resolve(running);
          };
        });
      },
    );
    await supervisor.start(config({}));
    hold = true;
    const applied = supervisor.apply({ xiaomi: { '1': 'a' } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(launches.stopped).toStrictEqual(['stopped']);
    const stopping = supervisor.stop();
    release();
    expect(await applied).toBe(true);
    await stopping;
    expect(launches.started).toHaveLength(2);
    expect(launches.stopped).toStrictEqual(['stopped', 'stopped']);
    expect(supervisor.isRunning()).toBe(false);
  });
});
