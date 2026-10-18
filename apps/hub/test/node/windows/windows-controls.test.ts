import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { PowerShell } from '../../../src/node/collectors/windows/powershell-session';
import { WindowsApps } from '../../../src/node/controls/windows/windows-apps';
import { WindowsPower } from '../../../src/node/controls/windows/windows-power';
import { WindowsProcessSource } from '../../../src/node/controls/windows/windows-processes';
import { windowsVolume } from '../../../src/node/controls/windows/windows-volume';
import { fakeRun } from '../fake-run';

function shell(answer: (script: string) => unknown): { shell: PowerShell; scripts: string[] } {
  const scripts: string[] = [];
  return {
    scripts,
    shell: {
      run: <T>(script: string, schema: z.ZodType<T>): Promise<T> => {
        scripts.push(script);
        return Promise.resolve(schema.parse(answer(script)));
      },
      stop: (): void => undefined,
    },
  };
}

describe('Windows power actions', () => {
  it.each([
    ['shut_down', 'shutdown.exe /s /t 0'],
    ['restart', 'shutdown.exe /r /t 0'],
    ['hibernate', 'shutdown.exe /h'],
    ['sign_out', 'shutdown.exe /l'],
    ['lock_screen', 'rundll32.exe user32.dll,LockWorkStation'],
    ['sleep', 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'],
  ] as const)('%s runs %s', async (action, command) => {
    const { run, calls } = fakeRun({ [command]: '' });
    await new WindowsPower(run).run(action);
    expect(calls).toStrictEqual([command]);
  });

  it('offers every power action', async () => {
    const { run } = fakeRun();
    expect(await new WindowsPower(run).available()).toHaveLength(6);
  });
});

describe('Windows apps', () => {
  const APPS = [
    { name: 'Calculator', id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
    { name: 'Notepad', id: '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\notepad.exe' },
  ];

  it('lists the Start menu apps by name', async () => {
    const { shell: powershell } = shell(() => APPS);
    const { run } = fakeRun();
    expect(await new WindowsApps(powershell, run).installed()).toStrictEqual([
      { id: APPS[0]?.id, name: 'Calculator', comment: null, icon: null },
      { id: APPS[1]?.id, name: 'Notepad', comment: null, icon: null },
    ]);
  });

  it('starts an installed app through Explorer', async () => {
    const { shell: powershell } = shell(() => APPS);
    const id = APPS[0]?.id ?? '';
    const { run, calls } = fakeRun({ [`explorer.exe shell:AppsFolder\\${id}`]: '' });
    await new WindowsApps(powershell, run).open(id);
    expect(calls).toStrictEqual([`explorer.exe shell:AppsFolder\\${id}`]);
  });

  it('refuses an app that is not in the Start menu list', async () => {
    const { shell: powershell } = shell(() => APPS);
    const { run, calls } = fakeRun();
    await expect(new WindowsApps(powershell, run).open('evil.exe')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(calls).toStrictEqual([]);
  });

  it('says closing an app is not available yet', async () => {
    const { shell: powershell } = shell(() => APPS);
    await expect(new WindowsApps(powershell, fakeRun().run).close()).rejects.toMatchObject({
      code: 'not_supported',
    });
  });
});

describe('Windows programs', () => {
  it('drops the idle process and names an unreadable owner', async () => {
    const { shell: powershell } = shell(() => [
      {
        pid: 0,
        ppid: 0,
        name: 'System Idle Process',
        command: '',
        threads: 8,
        memory: 0,
        cpuSeconds: 0,
        created: 0,
        user: '',
      },
      {
        pid: 4,
        ppid: 0,
        name: 'System',
        command: '',
        threads: 200,
        memory: 1000,
        cpuSeconds: 5,
        created: 1000,
        user: '',
      },
      {
        pid: 88,
        ppid: 4,
        name: 'notepad.exe',
        command: 'notepad.exe a.txt',
        threads: 3,
        memory: 4096,
        cpuSeconds: 1.5,
        created: 2000,
        user: 'dev',
      },
    ]);
    const rows = await new WindowsProcessSource(powershell).sweep();
    expect(rows.map((row) => [row.pid, row.user])).toStrictEqual([
      [4, 'unknown'],
      [88, 'dev'],
    ]);
    expect(rows[1]).toMatchObject({ start: 2000, cpuSeconds: 1.5, cpuPercentOfOneCore: null });
  });
});

describe('the Windows ring volume', () => {
  it('reads the volume and mute state, raises both, and puts them back', async () => {
    const { shell: powershell, scripts } = shell((script) =>
      script.includes('[pscustomobject]') ? { volume: 35, muted: true } : null,
    );
    const volume = windowsVolume(powershell);
    expect(await volume.current()).toStrictEqual({ volume: 35, muted: true });
    await volume.raise();
    await volume.restore({ volume: 35, muted: true });
    expect(scripts[1]).toContain('[SeAudio]::Set(1, $false)');
    expect(scripts[2]).toContain('[SeAudio]::Set(0.35, $true)');
  });

  it('declares the audio types only once per session', async () => {
    const { shell: powershell, scripts } = shell(() => null);
    await windowsVolume(powershell).raise();
    expect(scripts[0]).toContain("if (-not ('SeAudio' -as [type]))");
  });
});
