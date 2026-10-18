import { BLUETOOTH_DEVICE, type BluetoothDevice, type SystemState } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

type Bluetooth = NonNullable<SystemState['bluetooth']>;

const DEVICE_LINE = /^Device ((?:[0-9A-F]{2}:){5}[0-9A-F]{2}) (.+)$/i;

export function parseDeviceList(output: string): readonly { id: string; name: string }[] {
  return output.split('\n').flatMap((line) => {
    const match = DEVICE_LINE.exec(line.trim());
    return match === null ? [] : [{ id: match[1] ?? '', name: match[2] ?? '' }];
  });
}

function yes(output: string, key: string): boolean {
  return new RegExp(`^\\s*${key}:\\s*yes\\b`, 'mi').test(output);
}

function batteryOf(output: string): number | null {
  const match = /Battery Percentage:\s*0x[0-9a-f]+\s*\((\d+)\)/i.exec(output);
  const percent = Number(match?.[1]);
  return match === null || !Number.isFinite(percent) ? null : Math.min(100, percent);
}

export class Bluez {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
  ) {}

  async supported(): Promise<boolean> {
    return (
      (await this.probe.available('bluetoothctl', ['--version'])) &&
      (await this.run('bluetoothctl', ['list'])).trim() !== ''
    );
  }

  async read(): Promise<Bluetooth | null> {
    if (!(await this.supported())) {
      return null;
    }
    const enabled = yes(await this.run('bluetoothctl', ['show']), 'Powered');
    if (!enabled) {
      return { enabled, devices: [] };
    }
    const paired = parseDeviceList(await this.run('bluetoothctl', ['devices', 'Paired']));
    const devices = await Promise.all(paired.map((device) => this.describe(device)));
    return {
      enabled,
      devices: devices.sort(
        (a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name),
      ),
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.require();
    await this.run('bluetoothctl', ['power', enabled ? 'on' : 'off']);
  }

  async setConnected(device: string, connected: boolean): Promise<void> {
    await this.require();
    const wanted = device.toLowerCase();
    const found = parseDeviceList(await this.run('bluetoothctl', ['devices', 'Paired'])).find(
      (candidate) =>
        candidate.id.toLowerCase() === wanted || candidate.name.toLowerCase() === wanted,
    );
    if (found === undefined) {
      throw new NodeFailureError('not_found', `${device} is not a paired Bluetooth device.`);
    }
    await this.run('bluetoothctl', [connected ? 'connect' : 'disconnect', found.id]);
  }

  private async require(): Promise<void> {
    if (!(await this.supported())) {
      throw new NodeFailureError('not_supported', 'This computer has no Bluetooth to control.');
    }
  }

  private async describe(device: { id: string; name: string }): Promise<BluetoothDevice> {
    const info = await this.run('bluetoothctl', ['info', device.id]);
    return BLUETOOTH_DEVICE.parse({
      id: device.id,
      name: device.name,
      connected: yes(info, 'Connected'),
      batteryPercent: batteryOf(info),
    });
  }
}
