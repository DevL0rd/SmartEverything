import { orElse } from './fs-fallback';
import type { UsbDevice } from '@smarteverything/domain';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SYSFS_USB = '/sys/bus/usb/devices';
const DEVICE_NAME = /^\d+-\d+(\.\d+)*$/;

async function attribute(folder: string, name: string): Promise<string | null> {
  const text = await readFile(join(folder, name), 'utf8').then(
    (content) => content.trim(),
    () => '',
  );
  return text === '' ? null : text;
}

function speedOf(text: string | null): number | null {
  const speed = Number(text);
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

export class UsbDevices {
  constructor(private readonly root: string = SYSFS_USB) {}

  async supported(): Promise<boolean> {
    return readdir(this.root).then(
      () => true,
      () => false,
    );
  }

  async list(): Promise<readonly UsbDevice[]> {
    const names = await orElse<string[]>(readdir(this.root), []);
    const devices = await Promise.all(
      names.filter((name) => DEVICE_NAME.test(name)).map((name) => this.describe(name)),
    );
    return devices.filter((device) => device !== null).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async describe(name: string): Promise<UsbDevice | null> {
    const folder = join(this.root, name);
    const [vendorId, productId, manufacturer, product, speed] = await Promise.all([
      attribute(folder, 'idVendor'),
      attribute(folder, 'idProduct'),
      attribute(folder, 'manufacturer'),
      attribute(folder, 'product'),
      attribute(folder, 'speed'),
    ]);
    if (vendorId === null || productId === null) {
      return null;
    }
    return {
      id: name,
      name: product ?? `${vendorId}:${productId}`,
      vendor: manufacturer,
      speedMbps: speedOf(speed),
    };
  }
}
