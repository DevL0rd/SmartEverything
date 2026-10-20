import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  allFailed,
  appliedDetailOf,
  appliedOutcomeOf,
  firewallSteps,
  manualScript,
  reportScript,
  ruleText,
  stepResultOf,
  stepResultsOf,
  type FirewallPlan,
  type FirewallStep,
} from '../src';

const REVISION = '0123456789abcdef';

const PLAN: FirewallPlan = {
  backend: 'ufw',
  revision: REVISION,
  unprivilegedPortStart: 80,
  rules: [
    { rule: { purpose: 'camera', protocol: 'udp', source: '192.168.50.147' }, prepend: true },
    {
      rule: { purpose: 'hub', protocol: 'tcp', port: 7882, source: '192.168.50.0/24' },
      prepend: false,
    },
  ],
};

function stepOf(command: string, label = command): FirewallStep {
  return { label, program: 'sh', args: [], command };
}

describe('firewall steps', () => {
  it('names every command in words the owner can read', () => {
    expect(firewallSteps(PLAN).map((step) => step.label)).toStrictEqual([
      'Save the setting that lets programs listen on ports from 80',
      'Apply the setting for ports from 80 now',
      'SmartEverything camera: UDP from 192.168.50.147',
      'SmartEverything encrypted LAN: TCP port 7882 from 192.168.50.0/24',
    ]);
    expect(ruleText({ purpose: 'webrtc', protocol: 'udp', port: 8555 })).toBe('UDP port 8555');
  });

  it('puts sudo before every command of the copyable block', () => {
    const lines = manualScript({ ...PLAN, unprivilegedPortStart: null }).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.startsWith('sudo '))).toBe(true);
    expect(lines.at(-1)).toBe(
      "sudo ufw allow in proto tcp from 192.168.50.0/24 to any port 7882 comment 'SmartEverything encrypted LAN'",
    );
  });

  it('leaves the Windows block without sudo', () => {
    const windows: FirewallPlan = {
      backend: 'windows',
      revision: REVISION,
      program: 'C:\\go2rtc.exe',
      appProgram: 'C:\\app.exe',
      rules: [{ purpose: 'camera', protocol: 'udp', source: '192.168.50.147' }],
    };
    expect(manualScript(windows).startsWith('New-NetFirewallRule')).toBe(true);
  });
});

describe('one result per command', () => {
  const step = stepOf('ufw allow');

  it('reads ufw and firewalld answers for a rule that is already there', () => {
    expect(stepResultOf(step, 0, 'Rule added').outcome).toBe('applied');
    expect(stepResultOf(step, 0, 'Skipping adding existing rule\n').outcome).toBe(
      'already_present',
    );
    expect(stepResultOf(step, 0, 'Warning: ALREADY_ENABLED').outcome).toBe('already_present');
  });

  it('keeps the program message of a failure, or names the exit code', () => {
    expect(stepResultOf(step, 1, 'ERROR: Bad source address\n')).toMatchObject({
      outcome: 'failed',
      detail: 'ERROR: Bad source address',
    });
    expect(stepResultOf(step, 7, '').detail).toBe('it exited with code 7');
  });

  it('sums a run up as applied, partial or failed', () => {
    const ok = stepResultOf(step, 0, '');
    const bad = stepResultOf(step, 1, 'no');
    const there = stepResultOf(step, 0, 'Skipping adding existing rule');
    expect(appliedOutcomeOf([ok, there])).toBe('applied');
    expect(appliedOutcomeOf([ok, bad])).toBe('partial');
    expect(appliedOutcomeOf([bad, bad])).toBe('failed');
    expect(appliedDetailOf([ok, there, bad])).toBe(
      '1 change made, 1 change already in place, 1 change failed.',
    );
    expect(appliedDetailOf([ok, ok])).toBe('2 changes made.');
    expect(appliedDetailOf([])).toBe('There was nothing to change.');
  });

  it('fails every command with the same reason', () => {
    expect(allFailed([step, step], 'boom').map((result) => result.detail)).toStrictEqual([
      'boom',
      'boom',
    ]);
  });
});

describe.skipIf(process.platform === 'win32')('the report script', () => {
  const steps = [
    stepOf('echo Rule added'),
    stepOf('echo Skipping adding existing rule'),
    stepOf("sh -c 'echo ERROR: Bad source >&2; exit 3'"),
    stepOf('echo done'),
  ];

  function stdoutOf(script: string): string {
    return execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
  }

  it('runs every command even after one fails and reports each exit code and message', () => {
    const results = stepResultsOf(steps, stdoutOf(reportScript(steps)));
    expect(results.map((result) => result.outcome)).toStrictEqual([
      'applied',
      'already_present',
      'failed',
      'applied',
    ]);
    expect(results[2]?.detail).toBe('ERROR: Bad source');
  });

  it('marks commands the script never reported as failed', () => {
    const results = stepResultsOf(steps, '0\t0\tRule added\n');
    expect(results[0]?.outcome).toBe('applied');
    expect(results[1]).toMatchObject({
      outcome: 'failed',
      detail: 'The script stopped before this command ran.',
    });
  });

  it('reads reports that arrive with carriage returns, as AppleScript returns them', () => {
    const results = stepResultsOf(steps.slice(0, 2), '0\t0\tRule added\r1\t0\tRule added\r');
    expect(results.map((result) => result.outcome)).toStrictEqual(['applied', 'applied']);
  });
});
