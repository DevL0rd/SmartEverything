import type { AdapterSink } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  driverDeviceId,
  type DeviceDriver,
  type DeviceDriverContext,
  type DeviceDriverRegistry,
} from './device-driver';
import { background } from '@smarteverything/logging';

export interface DriverHostOptions {
  readonly registry: DeviceDriverRegistry;
  readonly sink: AdapterSink;
  readonly publishDevices: DeviceDriverContext['publishDevices'];
  readonly publishEvent: DeviceDriverContext['publishEvent'];
  readonly forget: (externalIds: readonly string[]) => Promise<void>;
  readonly log: Logger;
}

interface Running {
  readonly abort: AbortController;
  readonly stopped: Promise<() => Promise<void>>;
}

export class DriverHost {
  private readonly running = new Map<string, Running>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: DriverHostOptions) {}

  start(): void {
    this.options.registry.list().forEach((driver) => {
      this.launch(driver);
    });
    this.unsubscribe = this.options.registry.changes((driver, added) => {
      if (added) {
        this.launch(driver);
        return;
      }
      background(this.halt(driver.id), 'driver_host.halt_failed');
    });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await Promise.all([...this.running.keys()].map((id) => this.halt(id)));
  }

  private launch(driver: DeviceDriver): void {
    const abort = new AbortController();
    const context = this.contextFor(driver, abort.signal);
    const stopped = Promise.resolve().then(() => driver.start(context));
    this.running.set(driver.id, { abort, stopped });
    stopped.then(
      () => {
        this.options.log.info('driver.started', { driver: driver.id });
      },
      (cause: unknown) => {
        this.running.delete(driver.id);
        this.options.log.error('driver.start_failed', cause, { driver: driver.id });
      },
    );
  }

  private contextFor(driver: DeviceDriver, signal: AbortSignal): DeviceDriverContext {
    return {
      sink: this.options.sink,
      publishDevices: this.options.publishDevices,
      publishEvent: this.options.publishEvent,
      signal,
      forget: async (ids): Promise<void> => {
        try {
          await this.options.forget(ids.map((id) => driverDeviceId(driver.id, id)));
        } catch (cause) {
          this.options.log.error('driver.devices_not_removed', cause, {
            driver: driver.id,
            count: ids.length,
          });
          throw cause;
        }
      },
    };
  }

  private async halt(id: string): Promise<void> {
    const running = this.running.get(id);
    if (running === undefined) {
      return;
    }
    this.running.delete(id);
    running.abort.abort();
    try {
      const stop = await running.stopped;
      await stop();
    } catch (cause) {
      this.options.log.error('driver.stop_failed', cause, { driver: id });
    }
  }
}
