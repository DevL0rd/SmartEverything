import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UFW_MAC_SCRIPT, firewallSteps, reportScript } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CAMERA = 'b8:88:80:d7:19:ac';
const DEVICE = 'b8:88:80:d7:28:57';
const word = (mac: string): string => `udp,any,${mac}`;
const BASE = [
  '*filter',
  ':ufw-after-input - [0:0]',
  '-A ufw-after-input -p udp --dport 137 -j DROP',
  'COMMIT',
  '',
];

let directory = '';

function ufwStub(fail: boolean): string {
  return `#!/bin/sh\necho "$@" >> "${directory}/ufw.log"\n${fail ? 'exit 1' : 'exit 0'}\n`;
}

function run(entries: string, stale: string, fail = false, staleRules = ''): void {
  writeFileSync(join(directory, 'bin-ufw'), ufwStub(fail));
  chmodSync(join(directory, 'bin-ufw'), 0o755);
  execFileSync(
    'sh',
    [
      '-c',
      UFW_MAC_SCRIPT.replaceAll('ufw ', `${directory}/bin-ufw `),
      'sh',
      entries,
      stale,
      staleRules,
      join(directory, 'after.rules'),
      'ufw-after-input',
      join(directory, 'after6.rules'),
      'ufw6-after-input',
    ],
    { stdio: 'pipe' },
  );
}

const read = (name: string): string => readFileSync(join(directory, name), 'utf8');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ufw-mac-'));
  writeFileSync(join(directory, 'after.rules'), BASE.join('\n'));
  writeFileSync(join(directory, 'after6.rules'), BASE.join('\n'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('the ufw MAC script', () => {
  it('writes one accept line per MAC before the last COMMIT of each file, reloads, then deletes old address rules', () => {
    run(`${word(CAMERA)} ${word(DEVICE)}`, '192.168.50.147 192.168.50.198');
    expect(read('after.rules').split('\n')).toStrictEqual([
      '*filter',
      ':ufw-after-input - [0:0]',
      '-A ufw-after-input -p udp --dport 137 -j DROP',
      '# BEGIN SmartEverything MAC openings',
      `-A ufw-after-input -p udp -m mac --mac-source ${CAMERA} -j ACCEPT`,
      `-A ufw-after-input -p udp -m mac --mac-source ${DEVICE} -j ACCEPT`,
      '# END SmartEverything MAC openings',
      'COMMIT',
      '',
    ]);
    expect(read('after6.rules')).toContain(
      `-A ufw6-after-input -p udp -m mac --mac-source ${CAMERA}`,
    );
    expect(read('ufw.log').trim().split('\n')).toStrictEqual([
      'reload',
      'delete allow in proto udp from 192.168.50.147 to any',
      'delete allow in proto udp from 192.168.50.198 to any',
    ]);
  });

  it('deletes a bound duplicate rule with its interface and destination after the reload', () => {
    run(
      word(CAMERA),
      '',
      false,
      'tcp,7882,192.168.50.0/24,192.168.50.2,enp108s0 udp,53,fe80::/64,any,any',
    );
    expect(read('ufw.log').trim().split('\n')).toStrictEqual([
      'reload',
      'delete allow in on enp108s0 proto tcp from 192.168.50.0/24 to 192.168.50.2 port 7882',
      'delete allow in proto udp from fe80::/64 to any port 53',
    ]);
  });

  it('replaces the block it wrote before and leaves the rest of the file untouched', () => {
    run(`${word(CAMERA)} ${word(DEVICE)}`, '');
    run(word(CAMERA), '');
    const text = read('after.rules');
    expect(text).toContain(CAMERA);
    expect(text).not.toContain(DEVICE);
    expect(text.match(/BEGIN SmartEverything/g)).toHaveLength(1);
    expect(text).toContain('--dport 137 -j DROP');
  });

  it('removes the whole block when no MAC address is wanted', () => {
    run(word(CAMERA), '');
    run('', '');
    expect(read('after.rules')).toBe(BASE.join('\n'));
  });

  it('puts the old files back and deletes nothing when ufw refuses to reload', () => {
    expect(() => {
      run(word(CAMERA), '192.168.50.147', true, 'tcp,80,192.168.50.0/24,any,any');
    }).toThrow();
    expect(read('after.rules')).toBe(BASE.join('\n'));
    expect(read('after6.rules')).toBe(BASE.join('\n'));
    expect(read('ufw.log')).not.toContain('delete');
  });

  it('survives the quoting of the copyable command and of the elevated report script', () => {
    const steps = firewallSteps({
      backend: 'ufw',
      revision: '0123456789abcdef',
      unprivilegedPortStart: null,
      rules: [],
      mac: {
        entries: [{ mac: CAMERA, protocol: 'udp', port: null }],
        staleAddresses: ['192.168.50.147'],
        staleRules: [],
      },
    });
    for (const text of [steps[0]?.command ?? '', reportScript(steps)]) {
      expect(() => execFileSync('sh', ['-n', '-c', text], { stdio: 'pipe' })).not.toThrow();
    }
    const quoted = `sudo() { shift; "$@"; }\n${steps[0]?.command ?? ''}`.replace('sh -c', 'echo');
    expect(execFileSync('sh', ['-c', quoted], { encoding: 'utf8' })).toContain(
      'SmartEverything MAC openings',
    );
  });
});
