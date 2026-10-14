import type {
  AdapterSink,
  DeviceCommand,
  DeviceEvent,
  DiscoveredDevice,
  JsonValue,
} from '@smarteverything/domain';

export const DRIVER_ID_SEPARATOR = ':';

export interface DeviceDriverContext {
  readonly sink: AdapterSink;
  readonly publishEvent: (event: DeviceEvent) => Promise<string>;
  readonly publishDevices: (devices: readonly DiscoveredDevice[]) => Promise<void>;
  readonly signal: AbortSignal;
  readonly forget: (ids: readonly string[]) => Promise<void>;
}

export interface DeviceDriver {
  readonly id: string;
  readonly start: (context: DeviceDriverContext) => Promise<() => Promise<void>>;
  readonly execute: (command: DeviceCommand) => Promise<JsonValue>;
}

export function driverDeviceId(driverId: string, id: string): string {
  return `${driverId}${DRIVER_ID_SEPARATOR}${id}`;
}

export function driverIdOf(externalId: string): string | null {
  const end = externalId.indexOf(DRIVER_ID_SEPARATOR);
  return end > 0 ? externalId.slice(0, end) : null;
}

export class DeviceDriverRegistry {
  private readonly drivers = new Map<string, DeviceDriver>();
  private readonly listeners = new Set<(driver: DeviceDriver, added: boolean) => void>();

  register(driver: DeviceDriver): () => void {
    if (this.drivers.has(driver.id)) {
      throw new Error(`A device driver named ${driver.id} is already registered`);
    }
    this.drivers.set(driver.id, driver);
    this.notify(driver, true);
    return (): void => {
      if (this.drivers.get(driver.id) === driver) {
        this.drivers.delete(driver.id);
        this.notify(driver, false);
      }
    };
  }

  forDevice(externalId: string): DeviceDriver | null {
    const id = driverIdOf(externalId);
    return id === null ? null : (this.drivers.get(id) ?? null);
  }

  list(): readonly DeviceDriver[] {
    return [...this.drivers.values()];
  }

  changes(listener: (driver: DeviceDriver, added: boolean) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private notify(driver: DeviceDriver, added: boolean): void {
    this.listeners.forEach((listener) => {
      listener(driver, added);
    });
  }
}
