import { describe, expect, it } from 'vitest';
import {
  launchAgent,
  systemdUnit,
  windowsLauncher,
  windowsRunCommand,
} from '../src/service/definitions.js';
import { linuxManager } from '../src/service/linux-manager.js';
import { macManager } from '../src/service/mac-manager.js';
import { LingerUnsupportedError, type ManagerContext } from '../src/service/manager.js';
import { windowsManager } from '../src/service/windows-manager.js';
import { LAUNCH, LOCATIONS, failure, fakeSystem, type FakeSystem } from './support/fake-system.js';

function context(system: FakeSystem): ManagerContext {
  return { launch: LAUNCH, locations: LOCATIONS, system, user: { name: 'ann', uid: 501 } };
}

describe('linuxManager', () => {
  it('writes, enables and controls the systemd user unit', async () => {
    const system = fakeSystem();
    system.respond((_file, args) =>
      args.includes('show')
        ? 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success'
        : '',
    );
    const manager = linuxManager(context(system));
    expect(await manager.state()).toStrictEqual({
      installed: false,
      current: false,
      active: false,
      detail: 'systemd reports inactive (dead)',
    });
    await manager.install();
    await manager.start();
    await manager.restart();
    await manager.stop();
    expect(system.stored.get(LOCATIONS.unitFile)).toBe(systemdUnit(LAUNCH));
    expect(system.modes.get(LOCATIONS.unitFile)).toBe(0o644);
    system.respond(() => 'ActiveState=active\nSubState=running\nResult=success');
    expect(await manager.state()).toMatchObject({ installed: true, current: true, active: true });
    await manager.uninstall();
    expect(system.stored.has(LOCATIONS.unitFile)).toBe(false);
    await manager.uninstall();
    expect(system.commands.filter((command) => !command.includes(' show '))).toStrictEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable smarteverything.service',
      'systemctl --user start smarteverything.service',
      'systemctl --user restart smarteverything.service',
      'systemctl --user stop smarteverything.service',
      'systemctl --user disable --now smarteverything.service',
      'systemctl --user daemon-reload',
      'systemctl --user daemon-reload',
    ]);
  });

  it('reads and enables lingering for the signed-in user', async () => {
    const system = fakeSystem();
    system.respond(() => 'no\n');
    const manager = linuxManager(context(system));
    expect(await manager.linger()).toBe('disabled');
    await manager.enableLinger();
    expect(system.commands).toStrictEqual([
      'loginctl show-user ann --property=Linger --value',
      'loginctl enable-linger ann',
    ]);
  });
});

describe('macManager', () => {
  it('bootstraps the agent when launchd has not loaded it and kickstarts it when it has', async () => {
    const system = fakeSystem();
    let loaded = false;
    system.respond((_file, args) => {
      if (args[0] !== 'print') {
        loaded = args[0] === 'bootout' ? false : true;
        return '';
      }
      return loaded ? '\tstate = running\n' : failure('launchctl print', 113);
    });
    const manager = macManager(context(system));
    expect(await manager.state()).toStrictEqual({
      installed: false,
      current: false,
      active: false,
      detail: 'launchd has not loaded the agent',
    });
    await manager.restart();
    await manager.install();
    await manager.start();
    await manager.restart();
    expect(await manager.state()).toStrictEqual({
      installed: true,
      current: true,
      active: true,
      detail: 'launchd reports running',
    });
    expect(system.stored.get(LOCATIONS.launchAgentFile)).toBe(
      launchAgent(LAUNCH, LOCATIONS.outputLogFile),
    );
    await manager.uninstall();
    await manager.stop();
    expect(system.stored.has(LOCATIONS.launchAgentFile)).toBe(false);
    expect(
      system.commands.filter((command) => !command.startsWith('launchctl print')),
    ).toStrictEqual([
      `launchctl bootstrap gui/501 ${LOCATIONS.launchAgentFile}`,
      'launchctl kickstart gui/501/app.smarteverything.server',
      'launchctl kickstart -k gui/501/app.smarteverything.server',
      'launchctl bootout gui/501/app.smarteverything.server',
    ]);
  });

  it('passes on launchctl failures other than an unloaded agent, and has no lingering', async () => {
    const system = fakeSystem();
    system.respond(() => failure('launchctl print', 5));
    const manager = macManager(context(system));
    await expect(manager.state()).rejects.toThrow('launchctl print must succeed');
    expect(await manager.linger()).toBe('unsupported');
    await expect(manager.enableLinger()).rejects.toThrow(LingerUnsupportedError);
  });
});

describe('windowsManager', () => {
  it('registers a hidden Run entry and controls the supervisor through request files', async () => {
    const system = fakeSystem();
    let registered: string | null = null;
    system.respond((_file, args) => {
      if (args[0] === 'add') {
        registered = args[7] ?? null;
      }
      if (args[0] === 'delete') {
        registered = null;
      }
      if (args[0] === 'query') {
        return registered === null
          ? failure('reg query', 1)
          : `    SmartEverything    REG_SZ    ${registered}\r\n`;
      }
      return '';
    });
    const manager = windowsManager(context(system));
    expect(await manager.state()).toMatchObject({
      installed: false,
      current: false,
      active: false,
    });
    await manager.install();
    await manager.restart();
    system.touch(LOCATIONS.supervisorPidFile, '77\n');
    system.alive.add(77);
    expect(await manager.state()).toStrictEqual({
      installed: true,
      current: true,
      active: true,
      detail: 'the supervisor started at sign-in is running',
    });
    await manager.restart();
    await manager.stop();
    expect(system.stored.get(LOCATIONS.restartRequestFile)).toBe('restart');
    expect(system.stored.get(LOCATIONS.stopRequestFile)).toBe('stop');
    expect(system.stored.get(LOCATIONS.windowsLauncherFile)).toBe(windowsLauncher(LAUNCH));
    system.alive.delete(77);
    await manager.uninstall();
    await manager.uninstall();
    expect(system.stored.has(LOCATIONS.windowsLauncherFile)).toBe(false);
    expect(system.commands.filter((command) => !command.startsWith('reg query'))).toStrictEqual([
      `reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v SmartEverything /t REG_SZ /d ${windowsRunCommand(LOCATIONS.windowsLauncherFile)} /f`,
      `wscript.exe //B //Nologo ${LOCATIONS.windowsLauncherFile}`,
      'reg delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v SmartEverything /f',
    ]);
  });

  it('passes on reg failures other than a missing value, and has no lingering', async () => {
    const system = fakeSystem();
    system.respond(() => failure('reg query', 5));
    const manager = windowsManager(context(system));
    await expect(manager.state()).rejects.toThrow('reg query must succeed');
    expect(await manager.linger()).toBe('unsupported');
    await expect(manager.enableLinger()).rejects.toThrow(LingerUnsupportedError);
  });
});
