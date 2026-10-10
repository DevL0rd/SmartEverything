import {
  ApiError,
  WATCH_BRIDGE,
  type ClientRow,
  type DeviceRow,
  type JsonValue,
  type WatchBridge,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export type BridgedDevice = Pick<DeviceRow, 'id' | 'external_id' | 'details'>;

const BRIDGE_IDLE_MS = 2 * 60 * 60_000;

export interface WatchBridgesOptions {
  readonly observe: (
    externalId: string,
    values: Readonly<Record<string, JsonValue>>,
  ) => Promise<void>;
  readonly now: () => Date;
  readonly log: Logger;
}

function moment(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : 0;
}

export class WatchBridges {
  private readonly traffic = new Map<string, number>();
  private readonly assigned = new Map<string, WatchBridge>();

  constructor(private readonly options: WatchBridgesOptions) {}

  holderOf(device: BridgedDevice): WatchBridge | null {
    const raw = device.details['bridge'];
    const stored = raw === undefined || raw === null ? null : WATCH_BRIDGE.parse(raw);
    return this.assigned.get(device.id) ?? stored;
  }

  async acquire(
    device: BridgedDevice,
    client: Pick<ClientRow, 'id' | 'name'>,
  ): Promise<WatchBridge | null> {
    const holder = this.holderOf(device);
    if (holder !== null && holder.clientId !== client.id && this.alive(device, holder)) {
      return holder;
    }
    if (holder?.clientId !== client.id) {
      await this.assign(device, client, holder);
    }
    this.traffic.set(device.id, this.options.now().getTime());
    return null;
  }

  async require(device: BridgedDevice, client: Pick<ClientRow, 'id' | 'name'>): Promise<void> {
    const blocking = await this.acquire(device, client);
    if (blocking === null) {
      return;
    }
    this.options.log.warn('watch.bridge_refused', {
      device: device.id,
      client: client.id,
      holder: blocking.clientId,
    });
    throw new ApiError(
      'conflict',
      `Another app (${blocking.clientName}) is bridging this watch. Take over in this app’s watch settings to use it here.`,
    );
  }

  async takeOver(
    device: BridgedDevice,
    client: Pick<ClientRow, 'id' | 'name'>,
  ): Promise<WatchBridge> {
    const holder = this.holderOf(device);
    this.traffic.set(device.id, this.options.now().getTime());
    return holder?.clientId === client.id ? holder : this.assign(device, client, holder);
  }

  private alive(device: BridgedDevice, holder: WatchBridge): boolean {
    const reportedByHolder = device.details['reportedBy'] === holder.clientId;
    const lastSeen = Math.max(
      Date.parse(holder.since),
      this.traffic.get(device.id) ?? 0,
      reportedByHolder ? moment(device.details['reportedAt']) : 0,
    );
    return this.options.now().getTime() - lastSeen < BRIDGE_IDLE_MS;
  }

  private async assign(
    device: BridgedDevice,
    client: Pick<ClientRow, 'id' | 'name'>,
    previous: WatchBridge | null,
  ): Promise<WatchBridge> {
    const bridge: WatchBridge = {
      clientId: client.id,
      clientName: client.name,
      since: this.options.now().toISOString(),
    };
    this.assigned.set(device.id, bridge);
    await this.options.observe(device.external_id, { bridge });
    this.options.log.info('watch.bridge_assigned', {
      device: device.id,
      client: client.id,
      previous: previous?.clientId ?? null,
    });
    return bridge;
  }
}
