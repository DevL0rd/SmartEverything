import { DEFAULT_COMPUTER_SCOPES, type HubFrame, type NodeHello } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NodeCallError, NodeCalls } from '../../src/computers/node-calls';
import type { ComputerControls } from '../../src/node/controls/controls';
import { listeningPorts } from '../../src/node/controls/linux/linux-links';
import { LogindPower } from '../../src/node/controls/linux/logind-power';
import { NodeFailureError } from '../../src/node/node-failure';
import { NodeRequestHandler } from '../../src/node/request-handler';
import { ProgramFailedError, type RunProgram } from '../../src/node/run-program';

interface FakeSystem {
  readonly calls: string[];
  readonly run: RunProgram;
}

function fakeSystem(options: {
  readonly inhibitors?: unknown[];
  readonly refuse?: string;
  readonly hibernate?: string;
}): FakeSystem {
  const calls: string[] = [];
  const uid = process.getuid?.() ?? 0;
  const run: RunProgram = (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    if (file === 'loginctl' && args[0] === 'list-sessions') {
      return Promise.resolve(JSON.stringify([{ session: '2', uid, seat: 'seat0', class: 'user' }]));
    }
    if (line.includes('ListInhibitors')) {
      return Promise.resolve(JSON.stringify({ data: [options.inhibitors ?? []] }));
    }
    if (line.includes(' Can')) {
      const answer = line.endsWith('CanHibernate') ? (options.hibernate ?? 'yes') : 'yes';
      return Promise.resolve(JSON.stringify({ data: [answer] }));
    }
    if (options.refuse !== undefined) {
      return Promise.reject(new ProgramFailedError(file, options.refuse));
    }
    return Promise.resolve('');
  };
  return { calls, run };
}

const HELLO: NodeHello = {
  machineId: '0123456789abcdef0123456789abcdef',
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  power: [],
};

describe('logind power (fake system, nothing is ever powered off)', () => {
  it('offers what logind allows plus the session actions', async () => {
    const system = fakeSystem({ hibernate: 'na' });
    await expect(new LogindPower(system.run).available()).resolves.toEqual([
      'shut_down',
      'restart',
      'sleep',
      'lock_screen',
      'sign_out',
    ]);
  });

  it('names the program that blocks a shutdown and does not call logind', async () => {
    const system = fakeSystem({
      inhibitors: [['shutdown:sleep', 'Steam', 'Downloading a game', 'block', 1000, 42]],
    });
    const power = new LogindPower(system.run);
    await expect(power.run('shut_down')).rejects.toThrow(
      'Steam is stopping this computer from shutting down: Downloading a game.',
    );
    expect(system.calls.some((call) => call.includes('PowerOff'))).toBe(false);
  });

  it('asks logind without interactive prompts and explains a missing permission', async () => {
    const allowed = fakeSystem({});
    await new LogindPower(allowed.run).run('restart');
    expect(allowed.calls).toContain(
      'busctl call org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager Reboot b false',
    );
    const refused = fakeSystem({ refuse: 'Interactive authentication required.' });
    await expect(new LogindPower(refused.run).run('sleep')).rejects.toMatchObject({
      code: 'not_permitted',
    });
  });

  it('locks the signed-in session through loginctl', async () => {
    const system = fakeSystem({});
    await new LogindPower(system.run).run('lock_screen');
    expect(system.calls).toContain('loginctl lock-session 2');
  });
});

describe('node request handler', () => {
  function controls(ran: string[]): ComputerControls {
    return {
      power: {
        available: () => Promise.resolve([]),
        run: (action): Promise<void> => {
          ran.push(action);
          return Promise.resolve();
        },
      },
      processes: {
        list: () => Promise.resolve({ at: HELLO.bootedAt, total: 0, processes: [] }),
        signal: () => undefined,
        stop: () => undefined,
      },
      links: () => [],
      session: {
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        setVolume: (level): Promise<void> => {
          ran.push(`volume ${String(level)}`);
          return Promise.resolve();
        },
        setMuted: () => Promise.resolve(),
        playback: () => Promise.resolve(),
      },
      apps: {
        installed: () => Promise.resolve([]),
        open: (appId): Promise<void> => {
          ran.push(`open ${appId}`);
          return Promise.resolve();
        },
        close: () => Promise.resolve(0),
      },
      files: {
        list: () => Promise.reject(new Error('not used')),
        read: () => Promise.reject(new Error('not used')),
      },
      capture: { capture: () => Promise.reject(new Error('not used')) },
    };
  }

  it('refuses what the permissions turn off and runs what they allow', async () => {
    const ran: string[] = [];
    const handler = new NodeRequestHandler(controls(ran));
    handler.allow({ ...DEFAULT_COMPUTER_SCOPES, power: false });
    await expect(handler.handle({ verb: 'power', action: 'sleep' }, HELLO)).rejects.toMatchObject({
      code: 'scope_off',
    });
    handler.allow({ ...DEFAULT_COMPUTER_SCOPES, apps: false });
    await handler.handle({ verb: 'power', action: 'sleep' }, HELLO);
    await expect(
      handler.handle({ verb: 'open_app', appId: 'org.kde.dolphin' }, HELLO),
    ).rejects.toMatchObject({ code: 'scope_off' });
    handler.allow({ ...DEFAULT_COMPUTER_SCOPES, apps: true });
    await handler.handle({ verb: 'open_app', appId: 'org.kde.dolphin' }, HELLO);
    await handler.handle({ verb: 'volume', level: 30 }, HELLO);
    expect(ran).toEqual(['sleep', 'open org.kde.dolphin', 'volume 30']);
  });
});

describe('node calls', () => {
  it('matches replies to requests and fails pending calls when the computer leaves', async () => {
    const sent: HubFrame[] = [];
    const calls = new NodeCalls((frame) => sent.push(frame));
    const first = calls.call({ verb: 'links' });
    const second = calls.call({ verb: 'links' });
    const ids = sent.flatMap((frame) => (frame.type === 'request' ? [frame.id] : []));
    expect(calls.settle(ids[0] ?? '', { ok: true, value: [] })).toBe(true);
    await expect(first).resolves.toEqual([]);
    expect(calls.settle('unknown', { ok: true, value: null })).toBe(false);
    calls.close();
    await expect(second).rejects.toBeInstanceOf(NodeCallError);
  });

  it('turns a failure reply into a typed error', async () => {
    const sent: HubFrame[] = [];
    const calls = new NodeCalls((frame) => sent.push(frame));
    const pending = calls.call({ verb: 'links' });
    const [frame] = sent;
    calls.settle(frame?.type === 'request' ? frame.id : '', {
      ok: false,
      failure: { code: 'blocked', message: 'Busy' },
    });
    await expect(pending).rejects.toMatchObject({ code: 'blocked', message: 'Busy' });
  });
});

describe('connect links', () => {
  it('finds listening ports that are not loopback-only', () => {
    const table = [
      '  sl  local_address rem_address   st',
      '   0: 00000000:0016 00000000:0000 0A',
      '   1: 0100007F:170C 00000000:0000 0A',
      '   2: 00000000:0D3D 00000000:0000 01',
    ].join('\n');
    expect([...listeningPorts(table)]).toEqual([22]);
  });

  it('keeps failure codes on node errors', () => {
    expect(new NodeFailureError('not_own', 'No').code).toBe('not_own');
  });
});
