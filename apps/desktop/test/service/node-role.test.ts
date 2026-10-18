import { describe, expect, it } from 'vitest';
import {
  HUB_SERVICE_NAMES,
  NODE_SERVICE_NAMES,
  launchAgent,
  nodeSystemdUnit,
  serviceUnit,
  systemdUnit,
  windowsLauncher,
  windowsRunCommand,
  type ServiceLaunch,
} from '../../src/service/definitions.js';
import { linuxManager } from '../../src/service/linux-manager.js';
import { companionDirectory, serviceLocations } from '../../src/service/locations.js';
import { macManager } from '../../src/service/mac-manager.js';
import type { ManagerContext } from '../../src/service/manager.js';
import { ORIGINAL_SUFFIX } from '../../src/service/unit-adoption.js';
import { parseRunValue, windowsManager } from '../../src/service/windows-manager.js';
import { LAUNCH, failure, fakeSystem, type FakeSystem } from '../support/fake-system.js';

const NODE_DATA = companionDirectory(LAUNCH.dataDirectory);
const NODE_LAUNCH: ServiceLaunch = { ...LAUNCH, dataDirectory: NODE_DATA };
const INPUT = { home: '/home/ann', dataDirectory: NODE_DATA, xdgConfigHome: undefined };
const NODE_LOCATIONS = serviceLocations(INPUT, NODE_SERVICE_NAMES);
const INACTIVE = 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nResult=success';

function context(system: FakeSystem): ManagerContext {
  return {
    names: NODE_SERVICE_NAMES,
    launch: NODE_LAUNCH,
    locations: NODE_LOCATIONS,
    system,
    user: { name: 'ann', uid: 1000 },
  };
}

describe('the second role on a machine that is also the hub', () => {
  it('keeps its own data directory, unit, agent label and sign-in entry', () => {
    expect(NODE_DATA).toBe('/home/ann/.config/SmartEverything-node');
    expect(NODE_LOCATIONS.unitFile).toBe(
      '/home/ann/.config/systemd/user/smarteverything-node.service',
    );
    expect(NODE_LOCATIONS.launchAgentFile).toBe(
      '/home/ann/Library/LaunchAgents/app.smarteverything.node.plist',
    );
    expect(NODE_LOCATIONS.configFile).toBe(`${NODE_DATA}/service.json`);
    expect(serviceUnit(NODE_SERVICE_NAMES, NODE_LAUNCH)).toBe(nodeSystemdUnit(NODE_LAUNCH));
    expect(serviceUnit(HUB_SERVICE_NAMES, LAUNCH)).toBe(systemdUnit(LAUNCH));
    expect(nodeSystemdUnit(NODE_LAUNCH)).toContain(
      `Environment="SMARTEVERYTHING_DATA_DIRECTORY=${NODE_DATA}"`,
    );
  });
});

describe('the Linux node unit', () => {
  it('installs without lingering and never starts or restarts the unit', async () => {
    const system = fakeSystem();
    system.respond(() => INACTIVE);
    await linuxManager(context(system)).install();
    expect(system.stored.get(NODE_LOCATIONS.unitFile)).toBe(nodeSystemdUnit(NODE_LAUNCH));
    expect(system.commands).toEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable smarteverything-node.service',
    ]);
  });

  it('adopts the hand-written unit, reports it as not current until then, and can give it back', async () => {
    const system = fakeSystem();
    const handWritten = nodeSystemdUnit(NODE_LAUNCH).replace(
      'PATH=/usr/local/bin:/usr/bin',
      'PATH=/usr/bin',
    );
    system.touch(NODE_LOCATIONS.unitFile, handWritten);
    system.respond(() => 'ActiveState=active\nSubState=running\nResult=success');
    const manager = linuxManager(context(system));
    expect(await manager.state()).toMatchObject({ installed: true, current: false, active: true });
    await manager.install();
    expect(await manager.state()).toMatchObject({ installed: true, current: true });
    expect(system.stored.get(`${NODE_LOCATIONS.unitFile}${ORIGINAL_SUFFIX}`)).toBe(handWritten);
    expect(system.commands.some((command) => /(start|restart|stop)\b/u.test(command))).toBe(false);
    expect(await manager.restoreOriginal()).toBe(true);
    expect(system.stored.get(NODE_LOCATIONS.unitFile)).toBe(handWritten);
    expect(await manager.state()).toMatchObject({ current: false });
    expect(await manager.restoreOriginal()).toBe(false);
  });

  it('repeats the takeover without changing anything', async () => {
    const system = fakeSystem();
    system.respond(() => INACTIVE);
    system.touch(NODE_LOCATIONS.unitFile, 'hand written');
    const manager = linuxManager(context(system));
    await manager.install();
    const snapshot = new Map(system.stored);
    await manager.install();
    expect(system.stored).toEqual(snapshot);
  });
});

describe('the macOS node agent', () => {
  it('uses its own label and plist', async () => {
    const system = fakeSystem();
    system.respond((_file, args) => (args[0] === 'print' ? failure('launchctl print', 113) : ''));
    const manager = macManager(context(system));
    await manager.install();
    await manager.start();
    expect(system.stored.get(NODE_LOCATIONS.launchAgentFile)).toBe(
      launchAgent(NODE_LAUNCH, NODE_LOCATIONS.outputLogFile, 'app.smarteverything.node'),
    );
    expect(system.commands.filter((command) => !command.includes(' print '))).toEqual([
      `launchctl bootstrap gui/1000 ${NODE_LOCATIONS.launchAgentFile}`,
    ]);
    expect(await manager.restoreOriginal()).toBe(false);
  });
});

describe('the Windows node entry', () => {
  it('registers a second sign-in value and reads only its own', async () => {
    const system = fakeSystem();
    const added: string[] = [];
    system.respond((_file, args) => {
      if (args[0] === 'add') added.push(args[3] ?? '');
      return args[0] === 'query'
        ? `    SmartEverything    REG_SZ    other\r\n    SmartEverything Node    REG_SZ    ${windowsRunCommand(NODE_LOCATIONS.windowsLauncherFile)}\r\n`
        : '';
    });
    const manager = windowsManager(context(system));
    await manager.install();
    expect(added).toEqual(['SmartEverything Node']);
    expect(system.stored.get(NODE_LOCATIONS.windowsLauncherFile)).toBe(
      windowsLauncher(NODE_LAUNCH),
    );
    expect(await manager.state()).toMatchObject({ installed: true, current: true });
    expect(parseRunValue('    SmartEverything    REG_SZ    x', 'SmartEverything Node')).toBeNull();
  });
});
