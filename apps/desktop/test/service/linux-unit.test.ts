import { describe, expect, it } from 'vitest';
import { HUB_SERVICE_NAMES, systemdUnit } from '../../src/service/definitions.js';
import { linuxManager } from '../../src/service/linux-manager.js';
import type { ManagerContext } from '../../src/service/manager.js';
import { LAUNCH, LOCATIONS, failure, fakeSystem, type FakeSystem } from '../support/fake-system.js';

const INACTIVE = 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success';
const ACTIVE = 'ActiveState=active\nSubState=running\nResult=success';

function context(system: FakeSystem): ManagerContext {
  return {
    names: HUB_SERVICE_NAMES,
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
    expect(LOCATIONS.unitFile).toBe('/home/ann/.config/systemd/user/smarteverything.service');
    expect(LOCATIONS.dataDirectory).toBe('/home/ann/.config/SmartEverything');
  });
});

describe('linuxManager install', () => {
  it('writes the unit, enables it and turns lingering on for the current user', async () => {
    const system = fakeSystem();
    lingering(system, 'no');
    await linuxManager(context(system)).install();
    expect(system.stored.get(LOCATIONS.unitFile)).toBe(systemdUnit(LAUNCH));
    expect(system.modes.get(LOCATIONS.unitFile)).toBe(0o644);
    expect(system.commands).toStrictEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable smarteverything.service',
      'loginctl show-user ann --property=Linger --value',
      'loginctl enable-linger ann',
    ]);
  });

  it('leaves an already lingering user alone', async () => {
    const system = fakeSystem();
    lingering(system, 'yes');
    await linuxManager(context(system)).install();
    expect(system.commands).toStrictEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable smarteverything.service',
      'loginctl show-user ann --property=Linger --value',
    ]);
  });
});

describe('linuxManager when polkit refuses lingering', () => {
  function refusing(system: FakeSystem): void {
    system.respond((file, args) => {
      if (file !== 'loginctl') return args.includes('show') ? INACTIVE : '';
      return args[0] === 'show-user' ? 'no\n' : failure('loginctl enable-linger', 1);
    });
  }

  it('installs and starts anyway, trying lingering again on every start', async () => {
    const system = fakeSystem();
    refusing(system);
    const manager = linuxManager(context(system));
    await manager.install();
    await manager.start();
    expect(
      system.commands.filter((command) => command.startsWith('systemctl --user start')),
    ).toHaveLength(1);
    expect(
      system.commands.filter((command) => command === 'loginctl enable-linger ann'),
    ).toHaveLength(2);
  });

  it('turns lingering on at the next start once it is allowed', async () => {
    const system = fakeSystem();
    lingering(system, 'no');
    await linuxManager(context(system)).start();
    expect(system.commands.at(-1)).toBe('loginctl enable-linger ann');
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
    expect(
      system.commands.filter(
        (command) => !command.includes(' show') && !command.startsWith('loginctl'),
      ),
    ).toStrictEqual([
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

  it('reads lingering and enables it on request', async () => {
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
});
