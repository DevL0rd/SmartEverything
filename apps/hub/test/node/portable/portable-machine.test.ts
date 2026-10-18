import { describe, expect, it } from 'vitest';
import {
  PortableMachine,
  portableMachineReport,
} from '../../../src/node/controls/portable/portable-machine';
import type { SessionAgent } from '../../../src/node/session-agent/session-agent';

function stateOf(
  report: ReturnType<typeof portableMachineReport>,
  action: string,
): string | undefined {
  return report.actions.find((support) => support.action === action)?.state;
}

describe('what a Windows or Mac computer reports it can do', () => {
  it('can ring, open, screenshot and lock when the app runs', () => {
    const report = portableMachineReport('Windows', { agent: true, openNeedsApp: true });
    expect(
      report.actions
        .filter((support) => support.state === 'ready')
        .map((support) => support.action),
    ).toStrictEqual([
      'ring',
      'stop_ring',
      'launch_app',
      'open',
      'screenshot',
      'lock',
      'show_unlock',
      'receive_file',
    ]);
    expect(stateOf(report, 'unlock')).toBe('unsupported');
    expect(stateOf(report, 'flashlight')).toBe('unsupported');
  });

  it('names the missing app as the reason without it', () => {
    const report = portableMachineReport('Windows', { agent: false, openNeedsApp: true });
    for (const action of ['ring', 'stop_ring', 'open', 'screenshot']) {
      expect(stateOf(report, action)).toBe('unsupported');
    }
    expect(JSON.stringify(report.actions)).toContain('SmartEverything app is not running');
  });

  it('opens links on a Mac without the app', () => {
    const report = portableMachineReport('macOS', { agent: false, openNeedsApp: false });
    expect(stateOf(report, 'open')).toBe('ready');
    expect(stateOf(report, 'screenshot')).toBe('unsupported');
  });

  it('says plainly it cannot unlock', () => {
    const report = portableMachineReport('macOS', { agent: true, openNeedsApp: false });
    expect(JSON.stringify(report.actions.find((support) => support.action === 'unlock'))).toContain(
      'macOS cannot be unlocked',
    );
  });
});

describe('the Windows or Mac machine control', () => {
  function control(reachable: boolean): { machine: PortableMachine; calls: string[] } {
    const calls: string[] = [];
    const agent: SessionAgent = {
      reachable: () => Promise.resolve(reachable),
      watch: (onChange) => {
        calls.push('watch');
        onChange();
        return () => undefined;
      },
      open: () => Promise.resolve(),
      ring: () => Promise.resolve(),
      capture: () => Promise.reject(new Error('unused')),
    };
    const machine = new PortableMachine({
      machine: 'Windows',
      agent,
      ring: {
        set: (on): Promise<void> => {
          calls.push(`ring ${String(on)}`);
          return Promise.resolve();
        },
      },
      openNeedsApp: true,
      open: (target): Promise<void> => {
        calls.push(`open ${target.kind}`);
        return Promise.resolve();
      },
      wake: (): Promise<void> => {
        calls.push('wake');
        return Promise.resolve();
      },
    });
    return { machine, calls };
  }

  it('reports from whether the app answers', async () => {
    expect(stateOf(await control(true).machine.report(), 'ring')).toBe('ready');
    expect(stateOf(await control(false).machine.report(), 'ring')).toBe('unsupported');
  });

  it('passes ring, open and wake to the platform', async () => {
    const { machine, calls } = control(true);
    await machine.ring(true);
    await machine.open({ kind: 'url', url: 'https://example.com/' });
    await machine.showUnlock();
    expect(calls).toStrictEqual(['ring true', 'open url', 'wake']);
  });

  it('refuses to unlock and points to the unlock prompt', async () => {
    await expect(control(true).machine.unlock()).rejects.toMatchObject({ code: 'not_supported' });
  });

  it('follows the app coming and going', () => {
    const { machine, calls } = control(true);
    let changed = 0;
    machine.watch(() => {
      changed += 1;
    });
    expect(calls).toStrictEqual(['watch']);
    expect(changed).toBe(1);
  });
});
