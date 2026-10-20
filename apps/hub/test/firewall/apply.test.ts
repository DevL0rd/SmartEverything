import { describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import type { FirewallPlan, FirewallStatus } from '@smarteverything/domain';
import { FirewallApplier } from '../../src/firewall/apply';
import { networkOf } from '../../src/firewall/openings';
import type { FirewallSystem } from '../../src/firewall/system';
import { fakeSystem } from './fake-system';

const REVISION = '0123456789abcdef';
const CAMERA_COMMAND =
  "ufw allow in proto udp from 192.168.50.147 to any comment 'SmartEverything camera'";

function planOf(source = '192.168.50.0/24'): FirewallPlan {
  return {
    backend: 'ufw',
    revision: REVISION,
    unprivilegedPortStart: null,
    rules: [
      { rule: { purpose: 'camera', protocol: 'udp', source: '192.168.50.147' }, prepend: false },
      {
        rule: { purpose: 'hub', protocol: 'tcp', port: 7882, source },
        prepend: false,
      },
    ],
  };
}

function statusOf(plan: FirewallPlan | null): FirewallStatus {
  return {
    checkedAt: '2026-10-18T12:00:00.000Z',
    backend: 'ufw',
    filtering: true,
    detail: 'ufw is active.',
    openings: [],
    plan,
    cameras: [],
    lowPorts: null,
  };
}

interface Rig {
  readonly applier: FirewallApplier;
  readonly ran: string[];
}

function rigOf(
  plan: FirewallPlan | null,
  answer: (command: string) => ReturnType<FirewallSystem['run']>,
  platform: FirewallSystem['platform'] = 'linux',
): Rig {
  const ran: string[] = [];
  const system: FirewallSystem = {
    ...fakeSystem(),
    platform,
    run: (file, args): ReturnType<FirewallSystem['run']> => {
      const command = [file, ...args].join(' ');
      ran.push(command);
      return answer(command);
    },
  };
  const applier = new FirewallApplier({
    system,
    monitor: { check: (): Promise<FirewallStatus> => Promise.resolve(statusOf(plan)) },
    log: new Logger('hub.firewall'),
  });
  return { applier, ran };
}

const OK = (stdout: string): ReturnType<FirewallSystem['run']> =>
  Promise.resolve({ code: 0, stdout, stderr: '' });

describe('applying the firewall plan from the server', () => {
  it('adds every rule with passwordless sudo and reports each one', async () => {
    const { applier, ran } = rigOf(planOf(), () => OK('Rule added\n'));
    const result = await applier.apply(REVISION);
    expect(result.outcome).toBe('applied');
    expect(result.via).toBe('sudo');
    expect(result.steps.map((step) => step.outcome)).toStrictEqual(['applied', 'applied']);
    expect(ran[0]).toBe('sudo -n true');
    expect(ran[1]).toBe(`sudo -n ${CAMERA_COMMAND.replaceAll("'", '')}`);
    expect(result.commands.split('\n')[0]).toBe(`sudo ${CAMERA_COMMAND}`);
  });

  it('reports a rule ufw already holds as already present, so applying twice is safe', async () => {
    const held = new Set<string>();
    const { applier } = rigOf(planOf(), (command) => {
      if (command === 'sudo -n true') return OK('');
      const first = !held.has(command);
      held.add(command);
      return OK(first ? 'Rule added\n' : 'Skipping adding existing rule\n');
    });
    const first = await applier.apply(REVISION);
    const second = await applier.apply(REVISION);
    expect(first.steps.map((step) => step.outcome)).toStrictEqual(['applied', 'applied']);
    expect(second.outcome).toBe('applied');
    expect(second.steps.map((step) => step.outcome)).toStrictEqual([
      'already_present',
      'already_present',
    ]);
  });

  it('keeps going after a failing rule and says which one failed and why', async () => {
    const { applier } = rigOf(planOf(), (command) => {
      if (command.includes('from 192.168.50.147')) {
        return Promise.resolve({ code: 1, stdout: '', stderr: 'ERROR: Bad source address\n' });
      }
      return OK('Rule added\n');
    });
    const result = await applier.apply(REVISION);
    expect(result.outcome).toBe('partial');
    expect(result.steps.map((step) => step.outcome)).toStrictEqual(['failed', 'applied']);
    expect(result.steps[0]?.detail).toBe('ERROR: Bad source address');
  });

  it('fails when every rule fails', async () => {
    const { applier } = rigOf(planOf(), (command) =>
      command === 'sudo -n true'
        ? OK('')
        : Promise.resolve({ code: 1, stdout: '', stderr: 'ERROR: nope' }),
    );
    expect((await applier.apply(REVISION)).outcome).toBe('failed');
  });

  it('turns a program that crashes into a failed rule instead of losing the others', async () => {
    const { applier } = rigOf(planOf(), (command) =>
      command.includes('192.168.50.147') ? Promise.reject(new Error('timed out')) : OK(''),
    );
    const result = await applier.apply(REVISION);
    expect(result.steps.map((step) => step.outcome)).toStrictEqual(['failed', 'applied']);
    expect(result.steps[0]?.detail).toBe('timed out');
  });

  it('hands back the sudo commands when sudo needs a password and runs nothing else', async () => {
    const { applier, ran } = rigOf(planOf(), () =>
      Promise.resolve({ code: 1, stdout: '', stderr: 'sudo: a password is required\n' }),
    );
    const result = await applier.apply(REVISION);
    expect(result.outcome).toBe('unavailable');
    expect(result.via).toBeNull();
    expect(result.detail).toBe(
      'The server cannot use sudo without a password: sudo: a password is required.',
    );
    expect(result.commands).toContain(`sudo ${CAMERA_COMMAND}`);
    expect(ran).toStrictEqual(['sudo -n true']);
  });

  it('says so when sudo is not installed', async () => {
    const { applier } = rigOf(planOf(), () => Promise.resolve(null));
    const result = await applier.apply(REVISION);
    expect(result.outcome).toBe('unavailable');
    expect(result.detail).toBe('sudo is not installed on the server computer.');
  });

  it('leaves a firewall that only the desktop app can change to the desktop app', async () => {
    const windows: FirewallPlan = {
      backend: 'windows',
      revision: REVISION,
      program: 'C:\\go2rtc.exe',
      appProgram: 'C:\\app.exe',
      rules: [{ purpose: 'camera', protocol: 'udp', source: '192.168.50.147' }],
    };
    const { applier, ran } = rigOf(windows, () => OK(''), 'win32');
    const result = await applier.apply(REVISION);
    expect(result.outcome).toBe('unavailable');
    expect(result.detail).toContain('desktop app');
    expect(ran).toStrictEqual([]);
  });

  it('refuses a plan that changed since the owner saw it, without running anything', async () => {
    const { applier, ran } = rigOf(planOf(), () => OK(''));
    const result = await applier.apply('fedcba9876543210');
    expect(result.outcome).toBe('stale');
    expect(ran).toStrictEqual([]);
    const none = rigOf(null, () => OK(''));
    expect((await none.applier.apply(REVISION)).outcome).toBe('stale');
  });

  it('never runs two applications at once', async () => {
    let running = 0;
    let most = 0;
    const { applier } = rigOf(planOf(), async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return { code: 0, stdout: '', stderr: '' };
    });
    await Promise.all([applier.apply(REVISION), applier.apply(REVISION)]);
    expect(most).toBe(1);
  });
});

describe('the network a rule opens', () => {
  it('turns an interface address with host bits into its network', () => {
    expect(networkOf('192.168.50.2/24')).toBe('192.168.50.0/24');
    expect(networkOf('10.1.2.3/8')).toBe('10.0.0.0/8');
    expect(networkOf('192.168.50.0/24')).toBe('192.168.50.0/24');
    expect(networkOf('192.168.50.7')).toBe('192.168.50.7');
  });
});
