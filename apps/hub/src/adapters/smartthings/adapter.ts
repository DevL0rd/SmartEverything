import {
  CommandRefusedError,
  type AdapterSink,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
  type ProviderAdapter,
  type StateUpdate,
  type Unsubscribe,
} from '@smarteverything/domain';
import type { RunContext } from '../contract';
import { DeviceQueue } from './device-queue';
import { EventSubscriptions } from './event-subscriptions';
import type { SmartThingsApi, SmartThingsIo } from './http';
import type { Inventory } from './inventory';
import type { TokenKeeper } from './tokens';
import type { SmartThingsWebhooks } from './webhooks';

export class SmartThingsCommandFailedError extends Error {
  override readonly name = 'SmartThingsCommandFailedError';

  constructor(
    readonly externalId: string,
    readonly capability: string,
  ) {
    super(`SmartThings reported that the ${capability} command failed on device ${externalId}.`);
  }
}

export interface AdapterParts {
  readonly api: SmartThingsApi;
  readonly io: SmartThingsIo;
  readonly tokens: TokenKeeper;
  readonly inventory: Inventory;
  readonly context: RunContext;
  readonly webhooks: SmartThingsWebhooks;
}

class SmartThingsDevices {
  private readonly queues = new Map<string, DeviceQueue>();

  constructor(private readonly parts: AdapterParts) {}

  async discover(): Promise<readonly DiscoveredDevice[]> {
    return (await this.parts.inventory.load()).devices;
  }

  async execute(command: DeviceCommand): Promise<JsonValue> {
    await this.ensureInventory();
    const binding = this.parts.inventory.bindingFor(command.externalId, command.capability);
    if (binding === undefined) {
      throw new CommandRefusedError(command.capability, 'the device does not have it');
    }
    if (binding.write === null) {
      throw new CommandRefusedError(command.capability, 'it can only be read');
    }
    const outcomes = await this.queueFor(command.externalId).commands(binding.write(command.value));
    if (outcomes.some((outcome) => outcome.status === 'FAILED')) {
      throw new SmartThingsCommandFailedError(command.externalId, command.capability);
    }
    return outcomes.map((outcome) => outcome.status);
  }

  async refresh(externalIds: readonly string[]): Promise<readonly StateUpdate[]> {
    await this.ensureInventory();
    const results = await Promise.all(externalIds.map((externalId) => this.refreshOne(externalId)));
    return results.flat();
  }

  async subscribe(sink: AdapterSink): Promise<Unsubscribe> {
    const { inventory, io } = this.parts;
    await this.ensureInventory();
    const subscriptions = new EventSubscriptions({
      ...this.parts,
      sink,
      rediscover: async (): Promise<void> => {
        try {
          sink.devices(await this.discover());
        } catch (cause) {
          sink.failure({ provider: 'smartthings', externalId: null, operation: 'discover', cause });
        }
      },
    });
    inventory.currentStates(io.now().toISOString()).forEach((update) => {
      sink.state(update);
    });
    subscriptions.start();
    return () => subscriptions.stop();
  }

  private refreshOne(externalId: string): Promise<readonly StateUpdate[]> {
    const { api, inventory, io } = this.parts;
    inventory.requireDevice(externalId);
    return this.queueFor(externalId).request(async () => {
      const body = await api.request({ method: 'GET', path: `/v1/devices/${externalId}/status` });
      return inventory.replaceStatus(externalId, body, io.now().toISOString());
    });
  }

  private async ensureInventory(): Promise<void> {
    if (!this.parts.inventory.isLoaded) {
      await this.parts.inventory.load();
    }
  }

  private queueFor(externalId: string): DeviceQueue {
    const existing = this.queues.get(externalId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new DeviceQueue(externalId, this.parts.api, this.parts.io.now);
    this.queues.set(externalId, created);
    return created;
  }
}

export function createSmartThingsAdapter(parts: AdapterParts): ProviderAdapter {
  const devices = new SmartThingsDevices(parts);
  return {
    provider: 'smartthings',
    discover: () => devices.discover(),
    subscribe: (sink) => devices.subscribe(sink),
    execute: (command) => devices.execute(command),
    refresh: (externalIds) => devices.refresh(externalIds),
  };
}
