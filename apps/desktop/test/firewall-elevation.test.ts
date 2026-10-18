import { execFileSync } from 'node:child_process';
import { SOCKETFILTERFW, type FirewallPlan } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { elevatedRunOf } from '../src/firewall/elevation.js';

const REVISION = 'a'.repeat(32);
const TRICKY_PROGRAM = "/Applications/Smart Everything's Home/Electron";

const MAC_PLAN: FirewallPlan = {
  backend: 'macos',
  revision: REVISION,
  programs: [TRICKY_PROGRAM, '/opt/go2rtc'],
};

const UFW_PLAN: FirewallPlan = {
  backend: 'ufw',
  revision: REVISION,
  unprivilegedPortStart: 80,
  rules: [
    {
      prepend: true,
      rule: { purpose: 'hub', protocol: 'tcp', port: 8788, source: '192.168.1.0/24' },
    },
  ],
};

function scriptOf(args: readonly string[]): string {
  const script = args.at(-1);
  if (script === undefined) throw new Error('an elevated run must end with its script');
  return script;
}

function echoedWords(script: string): string[] {
  const echoing = script.replaceAll(SOCKETFILTERFW, "printf '%s\\n'");
  return execFileSync('/bin/sh', ['-c', echoing], { encoding: 'utf8' }).trimEnd().split('\n');
}

describe('elevated firewall run', () => {
  it('Linux runs one pkexec shell script that stops on the first failing command', () => {
    const run = elevatedRunOf(UFW_PLAN, 'linux');
    expect(run.program).toBe('pkexec');
    expect(run.args.slice(0, 2)).toEqual(['/bin/sh', '-c']);
    const lines = scriptOf(run.args).split('\n');
    expect(lines[0]).toBe('set -e');
    expect(lines.at(-1)).toBe(
      'ufw prepend allow in proto tcp from 192.168.1.0/24 to any port 8788 comment ' +
        "'SmartEverything encrypted LAN'",
    );
  });

  it.skipIf(process.platform === 'win32')(
    'macOS script keeps a program path with spaces and a quote as one word',
    () => {
      const script = scriptOf(elevatedRunOf(MAC_PLAN, 'darwin').args);
      expect(echoedWords(script)).toEqual([
        '--add',
        TRICKY_PROGRAM,
        '--unblockapp',
        TRICKY_PROGRAM,
        '--add',
        '/opt/go2rtc',
        '--unblockapp',
        '/opt/go2rtc',
      ]);
    },
  );

  it('macOS hands the script to AppleScript as an argument, never inside its source', () => {
    const run = elevatedRunOf(MAC_PLAN, 'darwin');
    expect(run.program).toBe('osascript');
    const source = run.args.filter((_, index) => index % 2 === 1 && index < 6);
    expect(source.join('\n')).not.toContain(TRICKY_PROGRAM);
    expect(scriptOf(run.args)).toContain("'/Applications/Smart Everything'\\''s Home/Electron'");
  });

  it('every platform reads a declined prompt from its own signal', () => {
    expect(elevatedRunOf(UFW_PLAN, 'linux').declinedWhen(126, '')).toBe(true);
    expect(elevatedRunOf(UFW_PLAN, 'linux').declinedWhen(1, '')).toBe(false);
    expect(elevatedRunOf(MAC_PLAN, 'darwin').declinedWhen(1, 'User canceled. (-128)')).toBe(true);
  });

  it('a plan for another platform is refused before anything runs', () => {
    expect(() => elevatedRunOf(MAC_PLAN, 'linux')).toThrow('macos');
  });

  it('Windows passes the whole plan as one encoded elevated PowerShell command', () => {
    const plan: FirewallPlan = {
      backend: 'windows',
      revision: REVISION,
      program: "C:\\Program Files\\go2rtc's\\go2rtc.exe",
      appProgram: 'C:\\Users\\Ann\\smarteverything.exe',
      rules: [{ purpose: 'camera', protocol: 'udp', source: '192.168.1.20' }],
    };
    const run = elevatedRunOf(plan, 'win32');
    expect(run.program).toBe('powershell.exe');
    const outer = Buffer.from(run.args.at(-1) ?? '', 'base64').toString('utf16le');
    const inner = /'-EncodedCommand','([^']+)'/u.exec(outer)?.[1] ?? '';
    const script = Buffer.from(inner, 'base64').toString('utf16le');
    expect(script).toContain("'C:\\Program Files\\go2rtc''s\\go2rtc.exe'");
    expect(run.declinedWhen(1223, '')).toBe(true);
  });
});
