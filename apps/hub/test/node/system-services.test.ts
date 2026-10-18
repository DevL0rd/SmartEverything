import { describe, expect, it } from 'vitest';
import {
  DoNotDisturb,
  type NotificationInhibitor,
} from '../../src/node/controls/linux/notifications-dnd';
import {
  NetworkManager,
  parseWifiNetworks,
  splitTerse,
} from '../../src/node/controls/linux/network-manager';
import { SystemdUser, isBlockedUnit } from '../../src/node/controls/linux/systemd-user';
import { ToolProbe } from '../../src/node/controls/linux/tool-probe';
import { ProgramFailedError } from '../../src/node/run-program';
import { fakeRun, type FakeRun } from './fake-run';

const DEVICES = 'nmcli -t -f DEVICE,TYPE,STATE device status';
const SAVED = 'nmcli -t -f NAME,TYPE connection show';
const ACTIVE = 'nmcli -t -f NAME,TYPE connection show --active';
const CONNECTIVITY = 'nmcli -t -f CONNECTIVITY general';

function network(extra: Record<string, string | Error> = {}): {
  fake: FakeRun;
  manager: NetworkManager;
  waits: number[];
} {
  const fake = fakeRun({
    'nmcli -v': 'nmcli tool, version 1.50',
    [DEVICES]: 'wlan0:wifi:connected\nenp1:ethernet:unavailable\nlo:loopback:unmanaged',
    [SAVED]: 'Home:802-11-wireless\nCafe:802-11-wireless\nWired connection 1:802-3-ethernet',
    [ACTIVE]: 'Home:802-11-wireless\nWired connection 1:802-3-ethernet',
    'nmcli radio wifi': 'enabled',
    ...extra,
  });
  const waits: number[] = [];
  const manager = new NetworkManager(fake.run, new ToolProbe(fake.run), (ms) => {
    waits.push(ms);
    return Promise.resolve();
  });
  return { fake, manager, waits };
}

describe('NetworkManager terse output', () => {
  it('splits on colons that are not escaped', () => {
    expect(splitTerse(String.raw`*:My\:Net:80:WPA2`)).toEqual(['*', 'My:Net', '80', 'WPA2']);
  });

  it('lists each network once, connected then known then strongest', () => {
    const scan = [
      ' :Cafe:40:WPA2',
      ' :Cafe:70:WPA2',
      '*:Home:55:WPA2',
      ' :Open:90:',
      ' ::30:WPA2',
      ' :Other:10:WPA2',
    ].join('\n');
    expect(
      parseWifiNetworks(scan, new Set(['Home', 'Cafe'])).map((n) => [
        n.ssid,
        n.signalPercent,
        n.secured,
        n.known,
        n.connected,
      ]),
    ).toEqual([
      ['Home', 55, true, true, true],
      ['Cafe', 70, true, true, false],
      ['Open', 90, false, false, false],
      ['Other', 10, true, false, false],
    ]);
  });
});

describe('Wi-Fi switching', () => {
  it('has no Wi-Fi state on a computer without a Wi-Fi adapter', async () => {
    const { manager } = network({ [DEVICES]: 'enp1:ethernet:connected' });
    expect(await manager.read()).toBeNull();
  });

  it('reports no networks while the radio is off', async () => {
    const { manager } = network({ 'nmcli radio wifi': 'disabled' });
    expect(await manager.read()).toEqual({ enabled: false, networks: [] });
  });

  it('refuses to turn Wi-Fi off when it is the only connection', async () => {
    const { manager, fake } = network();
    await expect(manager.setEnabled(false)).rejects.toMatchObject({ code: 'blocked' });
    expect(fake.calls).not.toContain('nmcli radio wifi off');
  });

  it('turns Wi-Fi off when a cable is connected', async () => {
    const { manager, fake } = network({
      [DEVICES]: 'wlan0:wifi:connected\nenp1:ethernet:connected',
      'nmcli radio wifi off': '',
    });
    await manager.setEnabled(false);
    expect(fake.calls).toContain('nmcli radio wifi off');
  });

  it('only joins networks saved on the computer', async () => {
    const { manager, fake } = network();
    await expect(manager.connect('Stranger')).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.calls.some((call) => call.includes('connection up'))).toBe(false);
  });

  it('stays on the new network when it reaches the internet', async () => {
    const { manager, fake } = network({
      'nmcli connection up id Cafe': '',
      [CONNECTIVITY]: 'full',
    });
    await manager.connect('cafe');
    expect(fake.calls.filter((call) => call.includes('connection up'))).toEqual([
      'nmcli connection up id Cafe',
    ]);
  });

  it('goes back to the old network when the new one has no internet', async () => {
    const { manager, fake, waits } = network({
      'nmcli connection up id Cafe': '',
      'nmcli connection up id Home': '',
      [CONNECTIVITY]: 'limited',
    });
    await expect(manager.connect('Cafe')).rejects.toThrow('went back to Home');
    expect(fake.calls.filter((call) => call.includes('connection up'))).toEqual([
      'nmcli connection up id Cafe',
      'nmcli connection up id Home',
    ]);
    expect(waits).toHaveLength(5);
  });

  it('goes back when joining fails outright and says if going back failed too', async () => {
    const { manager } = network({
      'nmcli connection up id Cafe': new ProgramFailedError('nmcli', 'Secrets were required'),
      'nmcli connection up id Home': new ProgramFailedError('nmcli', 'gone'),
    });
    await expect(manager.connect('Cafe')).rejects.toThrow('could not go back to Home');
  });

  it('does nothing when already on that network', async () => {
    const { manager, fake } = network();
    await manager.connect('Home');
    expect(fake.calls.some((call) => call.includes('connection up'))).toBe(false);
  });
});

describe('systemd services', () => {
  const USER_UNITS = JSON.stringify([
    {
      unit: 'backup.service',
      load: 'loaded',
      active: 'active',
      sub: 'running',
      description: 'Backup',
    },
    {
      unit: 'broken.service',
      load: 'loaded',
      active: 'failed',
      sub: 'failed',
      description: 'Broken',
    },
    {
      unit: 'smarteverything-node.service',
      load: 'loaded',
      active: 'active',
      sub: 'running',
      description: 'Node',
    },
    {
      unit: 'ghost.service',
      load: 'not-found',
      active: 'inactive',
      sub: 'dead',
      description: 'Ghost',
    },
    {
      unit: 'run-u1.service',
      load: 'loaded',
      active: 'active',
      sub: 'running',
      description: 'Transient',
    },
  ]);
  const USER_FILES = JSON.stringify([
    { unit_file: 'backup.service', state: 'enabled' },
    { unit_file: 'broken.service', state: 'disabled' },
    { unit_file: 'smarteverything-node.service', state: 'enabled' },
    { unit_file: 'run-u1.service', state: 'transient' },
  ]);
  const SYSTEM_UNITS = JSON.stringify([
    {
      unit: 'sshd.service',
      load: 'loaded',
      active: 'active',
      sub: 'running',
      description: 'OpenSSH',
    },
    {
      unit: 'dbus.service',
      load: 'loaded',
      active: 'active',
      sub: 'running',
      description: 'D-Bus',
    },
  ]);
  const TIMERS = JSON.stringify([
    {
      unit: 'arch-update.timer',
      activates: 'arch-update.service',
      next: 1792307424373757,
      last: 0,
    },
  ]);

  function systemd(): { fake: FakeRun; units: SystemdUser } {
    const fake = fakeRun({
      'systemctl --user --version': 'systemd 258',
      'systemctl --user list-units --type=service --all --output=json --no-pager': USER_UNITS,
      'systemctl --user list-unit-files --type=service --output=json --no-pager': USER_FILES,
      'systemctl list-units --type=service --all --output=json --no-pager': SYSTEM_UNITS,
      'systemctl --user list-timers --all --output=json --no-pager': TIMERS,
    });
    return { fake, units: new SystemdUser(fake.run, new ToolProbe(fake.run)) };
  }

  it('lists own services with state and login start, system ones flagged, and timers with times', async () => {
    const { units } = systemd();
    const state = await units.list();
    expect(state.services.map((s) => [s.unit, s.state, s.startsAtLogin, s.system])).toEqual([
      ['backup.service', 'active', true, false],
      ['broken.service', 'failed', false, false],
      ['smarteverything-node.service', 'active', true, false],
      ['sshd.service', 'active', null, true],
      ['dbus.service', 'active', null, true],
    ]);
    expect(state.timers).toEqual([
      {
        unit: 'arch-update.timer',
        description: 'arch-update.service',
        nextRunAt: new Date(1792307424373.757).toISOString(),
        lastRunAt: null,
      },
    ]);
  });

  it('runs the operation on an own service found by short name', async () => {
    const { units, fake } = systemd();
    fake.reply('systemctl --user restart backup.service', '');
    await units.set({ action: 'service', unit: 'Backup', operation: 'restart' });
    expect(fake.calls.at(-1)).toBe('systemctl --user restart backup.service');
  });

  it('never touches SmartEverything or the desktop plumbing', async () => {
    const { units, fake } = systemd();
    await expect(
      units.set({ action: 'service', unit: 'smarteverything-node', operation: 'stop' }),
    ).rejects.toMatchObject({ code: 'blocked' });
    expect(fake.calls.some((call) => call.includes(' stop '))).toBe(false);
    for (const unit of [
      'pipewire.service',
      'pipewire-pulse.socket',
      'wireplumber.service',
      'dbus.service',
      'plasma-kwin_wayland.service',
    ]) {
      expect(isBlockedUnit(unit)).toBe(true);
    }
    expect(isBlockedUnit('backup.service')).toBe(false);
  });

  it('keeps system services read-only', async () => {
    const { units } = systemd();
    await expect(
      units.set({ action: 'service', unit: 'sshd', operation: 'stop' }),
    ).rejects.toMatchObject({
      code: 'not_permitted',
    });
  });

  it('names a service that does not exist', async () => {
    const { units } = systemd();
    await expect(
      units.set({ action: 'service', unit: 'nothing', operation: 'start' }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('returns empty lists when systemd is not there', async () => {
    const fake = fakeRun({});
    expect(await new SystemdUser(fake.run, new ToolProbe(fake.run)).list()).toEqual({
      services: [],
      timers: [],
    });
  });
});

describe('Do Not Disturb', () => {
  const PROPERTY =
    'busctl --user --json=short get-property org.freedesktop.Notifications /org/freedesktop/Notifications org.freedesktop.Notifications Inhibited';

  function inhibitor(): NotificationInhibitor & { held: number[]; released: number[] } {
    const held: number[] = [];
    const released: number[] = [];
    return {
      held,
      released,
      inhibit: (): Promise<number> => {
        held.push(7);
        return Promise.resolve(7);
      },
      release: (cookie): Promise<void> => {
        released.push(cookie);
        return Promise.resolve();
      },
    };
  }

  function dnd(inhibited: boolean): { dnd: DoNotDisturb; held: ReturnType<typeof inhibitor> } {
    const fake = fakeRun({
      [PROPERTY]: `{"type":"b","data":${String(inhibited)}}`,
    });
    const held = inhibitor();
    return { dnd: new DoNotDisturb(fake.run, new ToolProbe(fake.run), held), held };
  }

  it('reports whether notifications are paused', async () => {
    expect(await dnd(true).dnd.read()).toBe(true);
    expect(await dnd(false).dnd.read()).toBe(false);
  });

  it('pauses notifications and releases its own hold later', async () => {
    const { dnd: pause, held } = dnd(false);
    await pause.set(true);
    expect(held.held).toEqual([7]);
    await pause.set(false);
    expect(held.released).toEqual([7]);
  });

  it('does not stack a second hold when already paused', async () => {
    const { dnd: pause, held } = dnd(true);
    await pause.set(true);
    expect(held.held).toEqual([]);
  });

  it('says so when the desktop itself holds it', async () => {
    const { dnd: pause } = dnd(true);
    await expect(pause.set(false)).rejects.toMatchObject({ code: 'not_supported' });
  });

  it('is unsupported without a notification service', async () => {
    const fake = fakeRun({});
    const pause = new DoNotDisturb(fake.run, new ToolProbe(fake.run), inhibitor());
    expect(await pause.read()).toBeNull();
    await expect(pause.set(true)).rejects.toMatchObject({ code: 'not_supported' });
  });
});
