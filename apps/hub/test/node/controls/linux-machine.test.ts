import type { AudioState, ComputerCapture, MachineActionSupport } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LinuxCapture } from '../../../src/node/controls/linux/linux-capture';
import { LinuxMachine } from '../../../src/node/controls/linux/linux-machine';
import { LinuxRing } from '../../../src/node/controls/linux/linux-ring';
import {
  linuxMachineReport,
  type LinuxFacts,
} from '../../../src/node/controls/linux/machine-support';
import { ProgramFailedError } from '../../../src/node/run-program';
import type { SessionAgent } from '../../../src/node/session-agent/session-agent';
import { fakeRun, type Reply } from '../fake-run';

const UID = String(process.getuid?.() ?? 0);
const SESSIONS = JSON.stringify([{ session: '2', uid: Number(UID), seat: 'seat0', class: 'user' }]);
const LIST = 'loginctl list-sessions --json=short';
const LINGER = `loginctl show-user ${UID} --property=Linger --value`;

const FACTS: LinuxFacts = {
  session: true,
  agent: true,
  plasma: true,
  spectacle: true,
  gio: true,
  opener: true,
  linger: true,
};

function stateOf(
  actions: readonly MachineActionSupport[],
  action: MachineActionSupport['action'],
): MachineActionSupport | undefined {
  return actions.find((support) => support.action === action);
}

interface AgentCalls {
  readonly agent: SessionAgent;
  readonly calls: string[];
  readonly ended: (() => void)[];
}

function fakeAgent(reachable = true): AgentCalls {
  const calls: string[] = [];
  const ended: (() => void)[] = [];
  const agent: SessionAgent = {
    reachable: () => Promise.resolve(reachable),
    watch: () => () => undefined,
    open: (target) => {
      calls.push(`open ${target.kind}`);
      return Promise.resolve();
    },
    ring: (on, done) => {
      calls.push(`ring ${String(on)}`);
      if (on) ended.push(done);
      return Promise.resolve();
    },
    capture: (target) => {
      calls.push(`capture ${target}`);
      return Promise.reject(new Error('no picture in this fake'));
    },
  };
  return { agent, calls, ended };
}

describe('what a Linux computer reports it can do', () => {
  it('is ready for everything it can do from a Plasma session with the app running', () => {
    const { actions, permissions } = linuxMachineReport(FACTS);
    const ready = actions.filter((support) => support.state === 'ready').map((s) => s.action);
    expect(ready).toEqual([
      'ring',
      'stop_ring',
      'launch_app',
      'open',
      'screenshot',
      'lock',
      'unlock',
      'receive_file',
    ]);
    expect(stateOf(actions, 'flashlight')).toMatchObject({ state: 'unsupported' });
    expect(stateOf(actions, 'show_unlock')).toMatchObject({ state: 'unsupported' });
    expect(permissions).toEqual([{ permission: 'linux_linger', granted: true }]);
  });

  it('cannot ring without the app and names the app in the reason', () => {
    const { actions } = linuxMachineReport({ ...FACTS, agent: false });
    expect(stateOf(actions, 'ring')).toMatchObject({
      state: 'unsupported',
      reason: 'Ringing needs it. The SmartEverything app is not running on this computer.',
    });
    expect(stateOf(actions, 'stop_ring')).toMatchObject({ state: 'unsupported' });
  });

  it('asks for the screenshot permission outside Plasma and offers nothing without the app', () => {
    const portal = linuxMachineReport({ ...FACTS, plasma: false });
    expect(stateOf(portal.actions, 'screenshot')).toMatchObject({
      state: 'needs_permission',
      permission: 'linux_portal_screenshot',
    });
    expect(portal.permissions).toContainEqual({
      permission: 'linux_portal_screenshot',
      granted: false,
    });
    const none = linuxMachineReport({ ...FACTS, plasma: false, agent: false });
    expect(stateOf(none.actions, 'screenshot')).toMatchObject({ state: 'unsupported' });
    const noSpectacle = linuxMachineReport({ ...FACTS, spectacle: false, agent: false });
    expect(stateOf(noSpectacle.actions, 'screenshot')).toMatchObject({ state: 'unsupported' });
  });

  it('offers nothing that needs a person while nobody is signed in', () => {
    const { actions } = linuxMachineReport({ ...FACTS, session: false });
    for (const action of ['launch_app', 'open', 'lock', 'unlock'] as const) {
      expect(stateOf(actions, action)).toMatchObject({
        state: 'unsupported',
        reason: 'Nobody is signed in on this computer.',
      });
    }
  });

  it('leaves the linger permission out when the system does not say', () => {
    expect(linuxMachineReport({ ...FACTS, linger: null }).permissions).toEqual([]);
  });
});

function machine(over: { readonly agent?: AgentCalls; readonly replies?: Record<string, Reply> }): {
  readonly machine: LinuxMachine;
  readonly run: ReturnType<typeof fakeRun>;
  readonly agent: AgentCalls;
} {
  const run = fakeRun({ [LIST]: SESSIONS, [LINGER]: 'yes\n', ...over.replies });
  const agent = over.agent ?? fakeAgent();
  const probes = new Set(['spectacle', 'gio', 'xdg-open']);
  const instance = new LinuxMachine({
    run: run.run,
    probe: (program): Promise<boolean> => Promise.resolve(probes.has(program)),
    agent: agent.agent,
    ring: { set: (): Promise<void> => Promise.resolve() },
    plasma: (): boolean => true,
  });
  return { machine: instance, run, agent };
}

describe('the Linux machine control', () => {
  it('reports from the programs, the session and the app it finds', async () => {
    const { machine: control } = machine({});
    const report = await control.report();
    expect(stateOf(report.actions, 'unlock')).toEqual({ action: 'unlock', state: 'ready' });
    expect(report.permissions).toEqual([{ permission: 'linux_linger', granted: true }]);
  });

  it('keeps reporting when the system cannot say about lingering', async () => {
    const { machine: control } = machine({
      replies: { [LINGER]: new ProgramFailedError('loginctl', 'no such user') },
    });
    const report = await control.report();
    expect(report.permissions).toEqual([]);
  });

  it('opens a link and a file with the desktop opener', async () => {
    const { machine: control, run } = machine({
      replies: {
        'xdg-open https://example.com/a': '',
        'xdg-open /home/me/note.txt': '',
      },
    });
    await control.open({ kind: 'url', url: 'https://example.com/a' });
    await control.open({ kind: 'path', path: '/home/me/note.txt' });
    expect(run.calls.filter((call) => call.startsWith('xdg-open'))).toEqual([
      'xdg-open https://example.com/a',
      'xdg-open /home/me/note.txt',
    ]);
  });

  it('unlocks only the signed-in person’s own graphical session', async () => {
    const { machine: control, run } = machine({ replies: { 'loginctl unlock-session 2': '' } });
    await control.unlock();
    expect(run.calls).toContain('loginctl unlock-session 2');
  });

  it('refuses to unlock when nobody is signed in', async () => {
    const { machine: control, run } = machine({ replies: { [LIST]: '[]' } });
    await expect(control.unlock()).rejects.toMatchObject({ code: 'no_session' });
    expect(run.calls.some((call) => call.includes('unlock-session'))).toBe(false);
  });

  it('turns a polkit refusal into not permitted', async () => {
    const { machine: control } = machine({
      replies: {
        'loginctl unlock-session 2': new ProgramFailedError(
          'loginctl',
          'Interactive authentication required.',
        ),
      },
    });
    await expect(control.unlock()).rejects.toMatchObject({ code: 'not_permitted' });
  });

  it('says plainly that it unlocks directly instead of showing the prompt', async () => {
    const { machine: control } = machine({});
    await expect(control.showUnlock()).rejects.toMatchObject({ code: 'not_supported' });
  });
});

interface Volume {
  volume: number;
  muted: boolean;
}

function ring(output: Volume | null): {
  readonly ring: LinuxRing;
  readonly agent: AgentCalls;
  readonly sound: Volume;
  readonly log: string[];
} {
  const agent = fakeAgent();
  const sound: Volume = { ...(output ?? { volume: 0, muted: false }) };
  const log: string[] = [];
  const instance = new LinuxRing(
    agent.agent,
    {
      read: (): Promise<AudioState> =>
        Promise.resolve({
          outputs:
            output === null
              ? []
              : [
                  {
                    id: 'sink',
                    name: 'Speakers',
                    kind: 'speakers' as const,
                    isDefault: true,
                    available: true,
                    volume: sound.volume,
                    muted: sound.muted,
                    maxVolume: 100,
                    batteryPercent: null,
                    usedBy: [],
                  },
                ],
          inputs: [],
          apps: [],
        }),
    },
    {
      setVolume: (level: number): Promise<void> => {
        sound.volume = level;
        log.push(`volume ${String(level)}`);
        return Promise.resolve();
      },
      setMuted: (muted: boolean): Promise<void> => {
        sound.muted = muted;
        log.push(`muted ${String(muted)}`);
        return Promise.resolve();
      },
    },
  );
  return { ring: instance, agent, sound, log };
}

describe('ringing a Linux computer', () => {
  it('turns the sound up, rings through the app and puts the sound back when told to stop', async () => {
    const rig = ring({ volume: 20, muted: true });
    await rig.ring.set(true);
    expect(rig.sound).toEqual({ volume: 100, muted: false });
    await rig.ring.set(false);
    expect(rig.agent.calls).toEqual(['ring true', 'ring false']);
    expect(rig.sound).toEqual({ volume: 20, muted: true });
  });

  it('puts the sound back when the person stops the ring in the app', async () => {
    const rig = ring({ volume: 35, muted: false });
    await rig.ring.set(true);
    rig.agent.ended[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rig.sound).toEqual({ volume: 35, muted: false });
  });

  it('keeps the first remembered volume when asked to ring twice', async () => {
    const rig = ring({ volume: 40, muted: false });
    await rig.ring.set(true);
    await rig.ring.set(true);
    await rig.ring.set(false);
    expect(rig.sound.volume).toBe(40);
  });

  it('restores the sound and fails when the app cannot ring', async () => {
    const rig = ring({ volume: 40, muted: false });
    const failing: SessionAgent = {
      ...rig.agent.agent,
      ring: () => Promise.reject(new Error('app gone')),
    };
    const again = new LinuxRing(
      failing,
      { read: (): Promise<AudioState> => Promise.resolve({ outputs: [], inputs: [], apps: [] }) },
      {
        setVolume: (): Promise<void> => Promise.resolve(),
        setMuted: (): Promise<void> => Promise.resolve(),
      },
    );
    await expect(again.set(true)).rejects.toMatchObject({ code: 'failed' });
  });
});

describe('Linux screenshots', () => {
  const picture = {
    mimeType: 'image/jpeg' as const,
    data: 'AA==',
    width: 1,
    height: 1,
    at: '2026-10-18T10:00:00.000Z',
  };

  it('uses Plasma’s own tool on Plasma and the app everywhere else', async () => {
    const agent = fakeAgent();
    const plasma = { capture: (): Promise<ComputerCapture> => Promise.resolve(picture) };
    await expect(new LinuxCapture(plasma, agent.agent, () => true).capture('screen')).resolves.toBe(
      picture,
    );
    expect(agent.calls).toEqual([]);
    await expect(
      new LinuxCapture(plasma, agent.agent, () => false).capture('screen'),
    ).rejects.toThrow('no picture');
    expect(agent.calls).toEqual(['capture screen']);
  });
});
