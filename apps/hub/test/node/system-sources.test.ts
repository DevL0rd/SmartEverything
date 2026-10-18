import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Autostart, parseStartupEntry, withHidden } from '../../src/node/controls/linux/autostart';
import { Bluez, parseDeviceList } from '../../src/node/controls/linux/bluez';
import { KeyboardLayouts } from '../../src/node/controls/linux/keyboard-layouts';
import { PowerProfiles, parseProfiles } from '../../src/node/controls/linux/power-profiles';
import { ToolProbe } from '../../src/node/controls/linux/tool-probe';
import { UpowerBattery, parseBattery } from '../../src/node/controls/linux/upower';
import { UsbDevices } from '../../src/node/controls/linux/usb-devices';
import { ProgramFailedError } from '../../src/node/run-program';
import { fakeRun } from './fake-run';

const BATTERY_TEXT = `  native-path:          BAT0
  power supply:         yes
  battery
    present:             yes
    state:               discharging
    energy-rate:         12.5 W
    time to empty:       2.5 hours
    percentage:          78%
    capacity:            92.4%`;

describe('battery from UPower', () => {
  it('reads level, state, time left, health and draw', () => {
    expect(parseBattery(BATTERY_TEXT)).toEqual({
      level: 78,
      state: 'discharging',
      pluggedIn: false,
      minutesLeft: 150,
      healthPercent: 92.4,
      drawWatts: 12.5,
    });
  });

  it('treats a pending charge as plugged in with no time left', () => {
    const text = BATTERY_TEXT.replace('discharging', 'pending-charge').replace(
      'time to empty:       2.5 hours',
      '',
    );
    expect(parseBattery(text)).toMatchObject({ state: 'idle', pluggedIn: true, minutesLeft: null });
  });

  it('reports no battery on a desktop computer', async () => {
    const { run } = fakeRun({
      'upower --version': 'UPower client version 1.0',
      'upower -e': '/org/freedesktop/UPower/devices/line_power_AC\n',
    });
    expect(await new UpowerBattery(run, new ToolProbe(run)).read()).toBeNull();
  });

  it('reports no battery when UPower is not installed', async () => {
    const { run } = fakeRun({});
    expect(await new UpowerBattery(run, new ToolProbe(run)).read()).toBeNull();
  });

  it('picks the battery device and ignores peripherals', async () => {
    const { run, calls } = fakeRun({
      'upower --version': 'x',
      'upower -e':
        '/org/freedesktop/UPower/devices/mouse_hidpp_battery_0\n/org/freedesktop/UPower/devices/battery_BAT0\n',
      'upower -i /org/freedesktop/UPower/devices/battery_BAT0': BATTERY_TEXT,
    });
    expect((await new UpowerBattery(run, new ToolProbe(run)).read())?.level).toBe(78);
    expect(calls).toContain('upower -i /org/freedesktop/UPower/devices/battery_BAT0');
  });
});

describe('power modes', () => {
  const LIST = `  performance:\n    CpuDriver: x\n\n* balanced:\n    CpuDriver: x\n\n  power-saver:\n    CpuDriver: x\n`;

  it('lists the profiles the computer offers', () => {
    expect(parseProfiles(LIST)).toEqual(['performance', 'balanced', 'power_saver']);
  });

  it('refuses a mode that is not offered and changes nothing', async () => {
    const fake = fakeRun({
      'powerprofilesctl get': 'balanced\n',
      'powerprofilesctl list': '* balanced:\n  power-saver:\n',
    });
    const profiles = new PowerProfiles(fake.run, new ToolProbe(fake.run));
    await expect(profiles.set('performance')).rejects.toMatchObject({ code: 'not_supported' });
    expect(fake.calls.some((call) => call.startsWith('powerprofilesctl set'))).toBe(false);
  });

  it('sets an offered mode with the tool name for it', async () => {
    const fake = fakeRun({
      'powerprofilesctl get': 'balanced\n',
      'powerprofilesctl list': '* balanced:\n  power-saver:\n',
      'powerprofilesctl set power-saver': '',
    });
    await new PowerProfiles(fake.run, new ToolProbe(fake.run)).set('power_saver');
    expect(fake.calls).toContain('powerprofilesctl set power-saver');
  });
});

describe('keyboard layouts', () => {
  const LIST_CALL =
    'busctl --user --json=short call org.kde.keyboard /Layouts org.kde.KeyboardLayouts getLayoutsList';
  const CURRENT_CALL =
    'busctl --user --json=short call org.kde.keyboard /Layouts org.kde.KeyboardLayouts getLayout';

  function layouts(): ReturnType<typeof fakeRun> {
    return fakeRun({
      [LIST_CALL]:
        '{"type":"a(sss)","data":[[["us","","English (US)"],["de","nodeadkeys","German"]]]}',
      [CURRENT_CALL]: '{"type":"u","data":[1]}',
    });
  }

  it('lists layouts with ids and marks the current one', async () => {
    const fake = layouts();
    expect(await new KeyboardLayouts(fake.run, new ToolProbe(fake.run)).read()).toEqual({
      layouts: [
        { id: 'us', name: 'English (US)' },
        { id: 'de:nodeadkeys', name: 'German' },
      ],
      current: 'de:nodeadkeys',
    });
  });

  it('switches by name to the index the desktop uses', async () => {
    const fake = layouts();
    fake.reply(
      'busctl --user call org.kde.keyboard /Layouts org.kde.KeyboardLayouts setLayout u 0',
      '',
    );
    await new KeyboardLayouts(fake.run, new ToolProbe(fake.run)).set('english (us)');
    expect(fake.calls.at(-1)).toMatch(/setLayout u 0$/);
  });

  it('names a layout that does not exist', async () => {
    const fake = layouts();
    await expect(
      new KeyboardLayouts(fake.run, new ToolProbe(fake.run)).set('klingon'),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('bluetooth', () => {
  const INFO = (connected: string, battery = ''): string =>
    `Device 14:CB:65:90:09:79 (public)\n\tName: x\n\tConnected: ${connected}\n${battery}`;

  function bluetooth(): ReturnType<typeof fakeRun> {
    return fakeRun({
      'bluetoothctl --version': 'bluetoothctl: 5.7',
      'bluetoothctl list': 'Controller AA:BB:CC:DD:EE:FF host [default]',
      'bluetoothctl show': 'Controller AA\n\tPowered: yes\n',
      'bluetoothctl devices Paired':
        'Device 14:CB:65:90:09:79 Xbox Controller\nDevice 20:20:01:6E:FE:D0 Headset\nnoise line',
      'bluetoothctl info 14:CB:65:90:09:79': INFO('no'),
      'bluetoothctl info 20:20:01:6E:FE:D0': INFO('yes', '\tBattery Percentage: 0x5a (90)\n'),
    });
  }

  it('parses device lines and ignores the rest', () => {
    expect(parseDeviceList('Device AA:BB:CC:DD:EE:FF My Phone\nNEW something')).toEqual([
      { id: 'AA:BB:CC:DD:EE:FF', name: 'My Phone' },
    ]);
  });

  it('lists paired devices with connected ones first and their battery', async () => {
    const fake = bluetooth();
    const state = await new Bluez(fake.run, new ToolProbe(fake.run)).read();
    expect(
      state?.devices.map((device) => [device.name, device.connected, device.batteryPercent]),
    ).toEqual([
      ['Headset', true, 90],
      ['Xbox Controller', false, null],
    ]);
  });

  it('has no device list while Bluetooth is off', async () => {
    const fake = bluetooth();
    fake.reply('bluetoothctl show', 'Controller AA\n\tPowered: no\n');
    expect(await new Bluez(fake.run, new ToolProbe(fake.run)).read()).toEqual({
      enabled: false,
      devices: [],
    });
  });

  it('is unsupported without a controller', async () => {
    const fake = bluetooth();
    fake.reply('bluetoothctl list', '');
    expect(await new Bluez(fake.run, new ToolProbe(fake.run)).read()).toBeNull();
    await expect(
      new Bluez(fake.run, new ToolProbe(fake.run)).setEnabled(true),
    ).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('connects a device found by name', async () => {
    const fake = bluetooth();
    fake.reply('bluetoothctl connect 20:20:01:6E:FE:D0', '');
    await new Bluez(fake.run, new ToolProbe(fake.run)).setConnected('headset', true);
    expect(fake.calls).toContain('bluetoothctl connect 20:20:01:6E:FE:D0');
  });

  it('refuses a device that is not paired', async () => {
    const fake = bluetooth();
    await expect(
      new Bluez(fake.run, new ToolProbe(fake.run)).setConnected('toaster', true),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('tool probe', () => {
  it('asks again for a missing tool only after a minute', async () => {
    let now = 0;
    const fake = fakeRun({});
    const probe = new ToolProbe(fake.run, () => now);
    expect(await probe.available('nmcli', ['-v'])).toBe(false);
    expect(await probe.available('nmcli', ['-v'])).toBe(false);
    expect(fake.calls).toHaveLength(1);
    now = 61_000;
    fake.reply('nmcli -v', 'nmcli tool');
    expect(await probe.available('nmcli', ['-v'])).toBe(true);
    expect(await probe.available('nmcli', ['-v'])).toBe(true);
    expect(fake.calls).toHaveLength(2);
  });

  it('keeps different checks of the same program apart', async () => {
    const fake = fakeRun({ 'busctl a': 'ok', 'busctl b': new ProgramFailedError('busctl', 'no') });
    const probe = new ToolProbe(fake.run);
    expect(await probe.available('busctl', ['a'])).toBe(true);
    expect(await probe.available('busctl', ['b'])).toBe(false);
  });
});

describe('with files on disk', () => {
  let folder = '';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'se-system-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  describe('USB devices', () => {
    async function device(name: string, files: Record<string, string>): Promise<void> {
      await mkdir(join(folder, name));
      for (const [file, content] of Object.entries(files)) {
        await writeFile(join(folder, name, file), content);
      }
    }

    it('lists real devices only, not interfaces', async () => {
      await device('1-1', {
        idVendor: '046d',
        idProduct: 'c52b',
        manufacturer: 'Logitech\n',
        product: 'Receiver\n',
        speed: '12\n',
      });
      await device('1-1:1.0', { idVendor: '046d', idProduct: 'c52b' });
      await device('usb1', { idVendor: '1d6b', idProduct: '0002' });
      await device('2-3', { idVendor: 'abcd', idProduct: '0001', speed: '5000' });
      expect(await new UsbDevices(folder).list()).toEqual([
        { id: '2-3', name: 'abcd:0001', vendor: null, speedMbps: 5000 },
        { id: '1-1', name: 'Receiver', vendor: 'Logitech', speedMbps: 12 },
      ]);
    });

    it('is unsupported where there is no USB tree', async () => {
      expect(await new UsbDevices(join(folder, 'missing')).supported()).toBe(false);
      expect(await new UsbDevices(join(folder, 'missing')).list()).toEqual([]);
    });
  });

  describe('startup apps', () => {
    const entry = (name: string, extra = ''): string =>
      `[Desktop Entry]\nType=Application\nName=${name}\nExec=${name.toLowerCase()} --start\n${extra}`;

    async function setup(): Promise<{ autostart: Autostart; user: string; global: string }> {
      const user = join(folder, 'user');
      const global = join(folder, 'global');
      await mkdir(user);
      await mkdir(global);
      return { autostart: new Autostart(user, [global]), user, global };
    }

    it('merges global and own entries, own ones overriding', async () => {
      const { autostart, user, global } = await setup();
      await writeFile(join(global, 'sync.desktop'), entry('Sync'));
      await writeFile(join(global, 'chat.desktop'), entry('Chat'));
      await writeFile(join(user, 'chat.desktop'), entry('Chat', 'Hidden=true\n'));
      await writeFile(join(user, 'notes.desktop'), entry('Notes'));
      await writeFile(join(user, 'readme.txt'), 'not an entry');
      expect((await autostart.list()).entries).toEqual([
        { id: 'chat.desktop', name: 'Chat', command: 'chat --start', enabled: false, global: true },
        {
          id: 'notes.desktop',
          name: 'Notes',
          command: 'notes --start',
          enabled: true,
          global: false,
        },
        { id: 'sync.desktop', name: 'Sync', command: 'sync --start', enabled: true, global: true },
      ]);
    });

    it('turns a system entry off with an own hidden copy and leaves the system file alone', async () => {
      const { autostart, user, global } = await setup();
      await writeFile(join(global, 'sync.desktop'), entry('Sync'));
      await autostart.set({ action: 'startup_app', id: 'sync', enabled: false });
      expect(await readFile(join(user, 'sync.desktop'), 'utf8')).toContain('Hidden=true');
      expect(await readFile(join(global, 'sync.desktop'), 'utf8')).not.toContain('Hidden');
      expect((await autostart.list()).entries[0]?.enabled).toBe(false);
    });

    it('turns an own entry off and on again by name', async () => {
      const { autostart, user } = await setup();
      await writeFile(join(user, 'notes.desktop'), entry('Notes'));
      await autostart.set({ action: 'startup_app', id: 'Notes', enabled: false });
      expect((await autostart.list()).entries[0]?.enabled).toBe(false);
      await autostart.set({ action: 'startup_app', id: 'notes.desktop', enabled: true });
      expect(await readFile(join(user, 'notes.desktop'), 'utf8')).not.toContain('Hidden');
      expect((await autostart.list()).entries[0]?.enabled).toBe(true);
    });

    it('names a startup app that does not exist', async () => {
      const { autostart } = await setup();
      await expect(
        autostart.set({ action: 'startup_app', id: 'ghost', enabled: true }),
      ).rejects.toMatchObject({
        code: 'not_found',
      });
    });
  });
});

describe('desktop entry text', () => {
  it('ignores other groups and respects the GNOME enabled flag', () => {
    const text =
      '[Desktop Action x]\nName=Wrong\n[Desktop Entry]\nName=Right\nExec=run\nX-GNOME-Autostart-enabled=false\n';
    expect(parseStartupEntry('a.desktop', text)).toEqual({
      id: 'a.desktop',
      name: 'Right',
      command: 'run',
      enabled: false,
    });
  });

  it('skips entries that are not applications', () => {
    expect(parseStartupEntry('a.desktop', '[Desktop Entry]\nType=Link\nName=x')).toBeNull();
  });

  it('adds and removes the hidden flag inside the entry group', () => {
    const hidden = withHidden('[Desktop Entry]\nName=A\n', true);
    expect(hidden.split('\n')).toEqual(['[Desktop Entry]', 'Hidden=true', 'Name=A', '']);
    expect(withHidden(hidden, false)).toBe('[Desktop Entry]\nName=A\n');
  });
});
