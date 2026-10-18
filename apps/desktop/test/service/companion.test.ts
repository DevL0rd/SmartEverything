import type { DesktopServiceStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  companionPaired,
  reconcileCompanion,
  type CompanionPort,
} from '../../src/service/companion.js';
import { NODE_SERVICE_NAMES } from '../../src/service/definitions.js';
import { companionDirectory, serviceLocations } from '../../src/service/locations.js';
import type { ManagerState } from '../../src/service/manager.js';
import { LAUNCH, fakeSystem } from '../support/fake-system.js';

const DATA = companionDirectory(LAUNCH.dataDirectory);
const LOCATIONS = serviceLocations(
  { home: '/home/ann', dataDirectory: DATA, xdgConfigHome: undefined },
  NODE_SERVICE_NAMES,
);
const NODE_CONFIG = JSON.stringify({
  role: 'node',
  node: {
    hub_url: 'http://192.168.1.2:7880',
    node_token: `sen_${'a'.repeat(43)}`,
    device_id: '6a0c6d69-3a35-4df0-9d35-0b2d0d0d0d0d',
  },
});
const STATUS: DesktopServiceStatus = {
  manager: 'systemd',
  health: 'running',
  installed: true,
  active: true,
  url: 'http://127.0.0.1:7880',
  dataDirectory: DATA,
  detail: 'fake',
  linger: 'unsupported',
};
const HUB_CONFIG = JSON.stringify({ go2rtcBinary: '/opt/go2rtc' });

function state(installed: boolean, current = installed): ManagerState {
  return { installed, current, active: installed, detail: 'fake' };
}

interface Rig {
  readonly companion: CompanionPort;
  readonly calls: string[];
  readonly config: (text: string | null) => void;
}

function rig(installed: boolean, config: string | null): Rig {
  const system = fakeSystem();
  const calls: string[] = [];
  if (config !== null) system.touch(LOCATIONS.configFile, config);
  return {
    calls,
    config: (text): void => {
      if (text === null) system.touch(LOCATIONS.configFile, null);
      else system.touch(LOCATIONS.configFile, text);
    },
    companion: {
      manager: { state: (): Promise<ManagerState> => Promise.resolve(state(installed)) },
      locations: LOCATIONS,
      system,
      controller: {
        ensure: (): Promise<DesktopServiceStatus> => {
          calls.push('ensure');
          return Promise.resolve(STATUS);
        },
        uninstall: (): Promise<DesktopServiceStatus> => {
          calls.push('uninstall');
          return Promise.resolve(STATUS);
        },
      },
    },
  };
}

describe('whether the computer client is paired', () => {
  it('is paired only when its own directory holds a node configuration', async () => {
    expect(await companionPaired(rig(false, null).companion)).toBe(false);
    expect(await companionPaired(rig(false, HUB_CONFIG).companion)).toBe(false);
    expect(await companionPaired(rig(false, NODE_CONFIG).companion)).toBe(true);
  });

  it('refuses a configuration it cannot read instead of calling the machine unpaired', async () => {
    await expect(companionPaired(rig(false, '{').companion)).rejects.toThrow();
  });
});

describe('keeping the computer client service in step with pairing', () => {
  it('does nothing for a machine that was never paired', async () => {
    const test = rig(false, null);
    await expect(reconcileCompanion(test.companion, () => undefined)).resolves.toBe('unpaired');
    expect(test.calls).toEqual([]);
  });

  it('removes the service once the machine is unpaired', async () => {
    const test = rig(true, null);
    await expect(reconcileCompanion(test.companion, () => undefined)).resolves.toBe('removed');
    expect(test.calls).toEqual(['uninstall']);
  });

  it('installs and starts the service for a paired machine and says it was the first time', async () => {
    const test = rig(false, NODE_CONFIG);
    let first = 0;
    await expect(
      reconcileCompanion(test.companion, () => {
        first += 1;
      }),
    ).resolves.toBe('running');
    expect(test.calls).toEqual(['ensure']);
    expect(first).toBe(1);
  });

  it('adopts an installed service without calling that the first time', async () => {
    const test = rig(true, NODE_CONFIG);
    let first = 0;
    await reconcileCompanion(test.companion, () => {
      first += 1;
    });
    expect(test.calls).toEqual(['ensure']);
    expect(first).toBe(0);
  });

  it('removes a service whose directory holds no node pairing', async () => {
    const test = rig(true, HUB_CONFIG);
    await expect(reconcileCompanion(test.companion, () => undefined)).resolves.toBe('removed');
  });
});
