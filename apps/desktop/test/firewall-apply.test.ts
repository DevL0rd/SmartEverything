import { FIREWALL_STATUS, type FirewallPlan, type FirewallStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { applyFirewall } from '../src/firewall/apply.js';
import { CommandFailedError } from '../src/service/system.js';

const REVISION = 'a'.repeat(16);

const PLAN: FirewallPlan = {
  backend: 'ufw',
  revision: REVISION,
  unprivilegedPortStart: null,
  rules: [
    { rule: { purpose: 'camera', protocol: 'udp', source: '192.168.50.147' }, prepend: false },
    {
      rule: { purpose: 'hub', protocol: 'tcp', port: 7882, source: '192.168.50.0/24' },
      prepend: false,
    },
  ],
};

function statusOf(plan: FirewallPlan | null): FirewallStatus {
  return FIREWALL_STATUS.parse({
    checkedAt: '2026-10-18T12:00:00.000Z',
    backend: 'ufw',
    filtering: true,
    detail: 'ufw is active.',
    openings: [],
    plan,
    cameras: [],
  });
}

interface Rig {
  readonly options: Parameters<typeof applyFirewall>[0];
  readonly runs: { readonly file: string; readonly args: readonly string[] }[];
  readonly calls: string[];
}

function rigOf(
  plan: FirewallPlan | null,
  run: (file: string, args: readonly string[]) => Promise<{ readonly stdout: string }>,
): Rig {
  const runs: Rig['runs'] = [];
  const calls: string[] = [];
  const options: Rig['options'] = {
    platform: 'linux',
    server: () => Promise.resolve({ url: 'http://127.0.0.1:1', token: 'secret' }),
    fetch: (input) => {
      calls.push(input instanceof URL ? input.pathname : 'other');
      return Promise.resolve(Response.json(statusOf(plan)));
    },
    run: (file, args) => {
      runs.push({ file, args });
      return run(file, args);
    },
  };
  return { options, runs, calls };
}

const REPORT = '0\t0\tRule added\n1\t0\tSkipping adding existing rule\n';

describe('applying the firewall through the system prompt', () => {
  it('runs one pkexec script and reports each rule, then reads the firewall again', async () => {
    const { options, runs, calls } = rigOf(PLAN, () => Promise.resolve({ stdout: REPORT }));
    const result = await applyFirewall(options, REVISION);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.file).toBe('pkexec');
    expect(result.outcome).toBe('applied');
    expect(result.via).toBe('desktop');
    expect(result.steps.map((step) => step.outcome)).toStrictEqual(['applied', 'already_present']);
    expect(result.commands).toContain('sudo ufw allow in proto udp from 192.168.50.147');
    expect(calls).toStrictEqual(['/api/firewall', '/api/firewall/check']);
  });

  it('reports a rule that ufw refused while the others were added', async () => {
    const { options } = rigOf(PLAN, () =>
      Promise.resolve({ stdout: '0\t1\tERROR: Bad source address\n1\t0\tRule added\n' }),
    );
    const result = await applyFirewall(options, REVISION);
    expect(result.outcome).toBe('partial');
    expect(result.steps[0]).toMatchObject({
      outcome: 'failed',
      detail: 'ERROR: Bad source address',
    });
  });

  it('says nothing changed when the prompt is dismissed', async () => {
    const { options } = rigOf(PLAN, () =>
      Promise.reject(new CommandFailedError('pkexec', 126, 'exited with code 126', '')),
    );
    const result = await applyFirewall(options, REVISION);
    expect(result.outcome).toBe('declined');
    expect(result.steps).toStrictEqual([]);
  });

  it('keeps pkexec output as the failure when there is no authentication agent', async () => {
    const { options } = rigOf(PLAN, () =>
      Promise.reject(
        new CommandFailedError(
          'pkexec',
          127,
          'exited with code 127',
          'No authentication agent found',
        ),
      ),
    );
    const result = await applyFirewall(options, REVISION);
    expect(result.outcome).toBe('failed');
    expect(result.detail).toBe('No authentication agent found');
    expect(result.steps.every((step) => step.outcome === 'failed')).toBe(true);
  });

  it('refuses a plan that is no longer the current one and runs nothing', async () => {
    const { options, runs } = rigOf(PLAN, () => Promise.resolve({ stdout: '' }));
    const result = await applyFirewall(options, 'b'.repeat(16));
    expect(result.outcome).toBe('stale');
    expect(runs).toStrictEqual([]);
  });
});
