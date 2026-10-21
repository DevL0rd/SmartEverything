import {
  ApiError,
  WATCH_BRIDGE,
  type ClientRow,
  type DeviceRow,
  type JsonValue,
  type WatchBridge,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';

export type BridgedDevice = Pick<DeviceRow, 'id' | 'external_id' | 'details'>;

const BRIDGE_IDLE_MS = 2 * 60 * 60_000;

const PAIRED = z.array(WATCH_BRIDGE.pick({ clientId: true, clientName: true })).catch([]);

type Paired = z.infer<typeof PAIRED>;

export interface WatchBridgesOptions {
  readonly observe: (
    externalId: string,
    values: Readonly<Record<string, JsonValue>>,
  ) => Promise<void>;
  readonly now: () => Date;
  readonly log: Logger;
}

function isPaired(paired: Paired, clientId: string): boolean {
  return paired.some((entry) => entry.clientId === clientId);
}

function moment(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : 0;
}

export class WatchBridges {
  private readonly traffic = new Map<string, number>();
  private readonly assigned = new Map<string, WatchBridge>();
  private readonly proven = new Map<string, Paired>();

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
    const blocking = this.blocker(device, client);
    if (blocking !== null) {
      return blocking;
    }
    if (this.holderOf(device)?.clientId !== client.id) {
      await this.assign(device, client, this.holderOf(device));
    }
    this.traffic.set(device.id, this.options.now().getTime());
    return null;
  }

  heldElsewhere(device: BridgedDevice, client: Pick<ClientRow, 'id'>): WatchBridge | null {
    return this.blocker(device, client);
  }

  async pair(device: BridgedDevice, client: Pick<ClientRow, 'id' | 'name'>): Promise<void> {
    const paired = this.pairedOf(device);
    if (isPaired(paired, client.id)) {
      return;
    }
    const next = [...paired, { clientId: client.id, clientName: client.name }];
    this.proven.set(device.id, next);
    await this.options.observe(device.external_id, { pairedBy: next });
    this.options.log.info('watch.bridge_paired', { device: device.id, client: client.id });
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

  private pairedOf(device: BridgedDevice): Paired {
    return this.proven.get(device.id) ?? PAIRED.parse(device.details['pairedBy']);
  }

  private blocker(device: BridgedDevice, client: Pick<ClientRow, 'id'>): WatchBridge | null {
    const holder = this.holderOf(device);
    if (holder?.clientId === client.id) {
      return null;
    }
    const paired = this.pairedOf(device);
    if (paired.length === 0) {
      return this.liveHolder(device, holder);
    }
    if (!isPaired(paired, client.id)) {
      return this.ownerOf(paired, holder);
    }
    return holder !== null && isPaired(paired, holder.clientId)
      ? this.liveHolder(device, holder)
      : null;
  }

  private liveHolder(device: BridgedDevice, holder: WatchBridge | null): WatchBridge | null {
    return holder !== null && this.alive(device, holder) ? holder : null;
  }

  private ownerOf(paired: Paired, holder: WatchBridge | null): WatchBridge | null {
    const owner = paired.find((entry) => entry.clientId === holder?.clientId) ?? paired[0];
    return owner === undefined
      ? null
      : { ...owner, since: holder?.since ?? this.options.now().toISOString() };
  }

  private alive(device: BridgedDevice, holder: WatchBridge): boolean {
    const reportedByHolder = device.details['reportedBy'] === holder.clientId;
    if (reportedByHolder && device.details['phase'] === 'failed') {
      return false;
    }
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
