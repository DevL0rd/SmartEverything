import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { systemdUnit } from '../../src/service/definitions.js';
import { linuxManager } from '../../src/service/linux-manager.js';
import type { ManagerContext } from '../../src/service/manager.js';
import { ORIGINAL_SUFFIX } from '../../src/service/unit-adoption.js';
import { LAUNCH, LOCATIONS, failure, fakeSystem, type FakeSystem } from '../support/fake-system.js';

const INACTIVE = 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success';
const ACTIVE = 'ActiveState=active\nSubState=running\nResult=success';
const UNIT = 'smarteverything-node.service';

function context(system: FakeSystem): ManagerContext {
  return {
    launch: LAUNCH,
    locations: LOCATIONS,
    system,
    user: { name: 'ann', uid: 1000 },
  };
}

function lingering(system: FakeSystem, value: 'yes' | 'no'): void {
  system.respond((file, args) => {
    if (file === 'loginctl') {
      return args[0] === 'show-user' ? `${value}\n` : '';
    }
    return args.includes('show') ? INACTIVE : '';
  });
}

describe('linux user unit', () => {
  it('starts after boot as the user, restarts on failure and lives in the user home', () => {
    const unit = systemdUnit(LAUNCH);
    expect(unit).toContain('WantedBy=default.target');
    expect(unit).not.toContain('multi-user.target');
    expect(unit).not.toMatch(/^User=/mu);
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain(
      'ExecStart="/opt/SmartEverything/smarteverything" "/opt/SmartEverything/resources/service/service.mjs"',
    );
    expect(LOCATIONS.unitFile).toBe(`/home/ann/.config/systemd/user/${UNIT}`);
  });
});

describe('linuxManager install', () => {
  it('writes the unit and enables it without touching lingering or starting it', async () => {
    const system = fakeSystem();
    lingering(system, 'no');
    await linuxManager(context(system)).install();
    expect(system.stored.get(LOCATIONS.unitFile)).toBe(systemdUnit(LAUNCH));
    expect(system.modes.get(LOCATIONS.unitFile)).toBe(0o644);
    expect(system.commands).toStrictEqual([
      'systemctl --user daemon-reload',
      `systemctl --user enable ${UNIT}`,
    ]);
  });

  it('starts the unit without touching lingering', async () => {
    const system = fakeSystem();
    lingering(system, 'no');
    await linuxManager(context(system)).start();
    expect(system.commands).toStrictEqual([`systemctl --user start ${UNIT}`]);
  });

  it('adopts the hand-written unit, reports it as not current until then, and can give it back', async () => {
    const system = fakeSystem();
    const handWritten = systemdUnit(LAUNCH).replace(
      'PATH=/usr/local/bin:/usr/bin',
      'PATH=/usr/bin',
    );
    system.touch(LOCATIONS.unitFile, handWritten);
    system.respond(() => ACTIVE);
    const manager = linuxManager(context(system));
    expect(await manager.state()).toMatchObject({ installed: true, current: false, active: true });
    await manager.install();
    expect(await manager.state()).toMatchObject({ installed: true, current: true });
    expect(system.stored.get(`${LOCATIONS.unitFile}${ORIGINAL_SUFFIX}`)).toBe(handWritten);
    expect(system.commands.some((command) => /(start|restart|stop)\b/u.test(command))).toBe(false);
    expect(await manager.restoreOriginal()).toBe(true);
    expect(system.stored.get(LOCATIONS.unitFile)).toBe(handWritten);
    expect(await manager.state()).toMatchObject({ current: false });
    expect(await manager.restoreOriginal()).toBe(false);
  });

  it('repeats the takeover without changing anything', async () => {
    const system = fakeSystem();
    system.respond(() => INACTIVE);
    system.touch(LOCATIONS.unitFile, 'hand written');
    const manager = linuxManager(context(system));
    await manager.install();
    const snapshot = new Map(system.stored);
    await manager.install();
    expect(system.stored).toEqual(snapshot);
  });

  it('rewrites the unit an earlier Desktop wrote with the old folder variable and keeps no original', async () => {
    const system = fakeSystem();
    const earlier = systemdUnit(LAUNCH)
      .replace('SMARTEVERYTHING_COMPUTER_DIRECTORY', 'SMARTEVERYTHING_DATA_DIRECTORY')
      .replace('SmartEverything Computer service', 'SmartEverything computer client');
    system.touch(LOCATIONS.unitFile, earlier);
    system.touch(
      `${LOCATIONS.dataDirectory}/service-unit.sha256`,
      createHash('sha256').update(earlier).digest('hex'),
    );
    system.respond(() => ACTIVE);
    const manager = linuxManager(context(system));
    expect(await manager.state()).toMatchObject({ installed: true, current: false });
    await manager.install();
    expect(system.stored.get(LOCATIONS.unitFile)).toBe(systemdUnit(LAUNCH));
    expect(system.stored.get(LOCATIONS.unitFile)).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    expect(system.stored.has(`${LOCATIONS.unitFile}${ORIGINAL_SUFFIX}`)).toBe(false);
    expect(await manager.state()).toMatchObject({ current: true });
  });
});

describe('linuxManager control', () => {
  it('reads state and drives the user unit', async () => {
    const system = fakeSystem();
    lingering(system, 'yes');
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
    system.respond(() => ACTIVE);
    expect(await manager.state()).toMatchObject({ installed: true, current: true, active: true });
    await manager.uninstall();
    await manager.uninstall();
    expect(system.stored.has(LOCATIONS.unitFile)).toBe(false);
    expect(system.commands.filter((command) => !command.includes(' show'))).toStrictEqual([
      'systemctl --user daemon-reload',
      `systemctl --user enable ${UNIT}`,
      `systemctl --user start ${UNIT}`,
      `systemctl --user restart ${UNIT}`,
      `systemctl --user stop ${UNIT}`,
      `systemctl --user disable --now ${UNIT}`,
      'systemctl --user daemon-reload',
      'systemctl --user daemon-reload',
    ]);
  });

  it('reads lingering and enables it only on request', async () => {
    const system = fakeSystem();
    lingering(system, 'no');
    const manager = linuxManager(context(system));
    expect(await manager.linger()).toBe('disabled');
    await manager.enableLinger();
    expect(system.commands).toStrictEqual([
      'loginctl show-user ann --property=Linger --value',
      'loginctl enable-linger ann',
    ]);
  });

  it('passes on a refused lingering request', async () => {
    const system = fakeSystem();
    system.respond(() => failure('loginctl enable-linger', 1));
    await expect(linuxManager(context(system)).enableLinger()).rejects.toThrow(
      'loginctl enable-linger must succeed',
    );
  });
});
