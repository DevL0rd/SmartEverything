import { platform } from 'node:os';
import { z } from 'zod';
import { type HubDiscoveryCandidate } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { SessionBus } from '../node/controls/linux/dbus-session';
import { openMdns, type Mdns, type OpenMdns, type ServiceWatch } from '../network/mdns';
import { findHubs } from './hub-discovery';

const NETWORK_MANAGER = 'org.freedesktop.NetworkManager';
const NETWORK_TELEMETRY = z.union([
  z.tuple([
    z.literal('org.freedesktop.NetworkManager.AccessPoint'),
    z
      .strictObject({
        Strength: z
          .strictObject({ signature: z.literal('y'), value: z.int().min(0).max(255) })
          .optional(),
        LastSeen: z.strictObject({ signature: z.literal('i'), value: z.int32() }).optional(),
      })
      .refine(
        (properties) =>
          Object.keys(properties).length > 0 &&
          Object.values(properties).every((value) => value !== undefined),
      ),
    z.tuple([]),
  ]),
  z.tuple([
    z.literal('org.freedesktop.NetworkManager.Device.Statistics'),
    z
      .partialRecord(
        z.enum(['RxBytes', 'TxBytes']),
        z.strictObject({ signature: z.literal('t'), value: z.uint64() }),
      )
      .refine((properties) => Object.keys(properties).length > 0),
    z.tuple([]),
  ]),
]);
export type NetworkEventBus = Pick<SessionBus, 'call' | 'watch' | 'onError' | 'close'>;

export class NodeRouteEvents {
  private mdns: Mdns | null = null;
  private watch: ServiceWatch | null = null;
  private stopped = false;
  private readonly stops: (() => void)[] = [];
  constructor(
    private readonly options: {
      readonly changed: () => void;
      readonly discovered: (candidate: HubDiscoveryCandidate) => void;
      readonly log: Logger;
      readonly bus?: () => NetworkEventBus;
      readonly mdns?: OpenMdns;
    },
  ) {}
  async start(discoveryEnabled: boolean): Promise<void> {
    if (!(await this.followNetworkManager()))
      this.stops.push(this.session().onNetworkChange(this.options.changed));
    if (discoveryEnabled) this.discover();
  }
  private session(): Mdns {
    this.mdns ??= (this.options.mdns ?? openMdns)((cause) => {
      this.failed(cause);
    });
    return this.mdns;
  }
  discover(): void {
    if (this.stopped) return;
    if (this.watch === null)
      this.watch = findHubs(this.session(), {
        found: (_key, candidate) => {
          this.options.discovered(candidate);
        },
      });
    else this.watch.rediscover();
  }
  private async followNetworkManager(): Promise<boolean> {
    if (platform() !== 'linux') return false;
    const bus = this.options.bus === undefined ? SessionBus.system() : this.options.bus();
    bus.onError((cause) => {
      this.failed(cause);
    });
    try {
      await bus.call({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        iface: 'org.freedesktop.DBus',
        member: 'GetNameOwner',
        signature: 's',
        body: [NETWORK_MANAGER],
      });
      const stop = await bus.watch(
        {
          sender: NETWORK_MANAGER,
          iface: 'org.freedesktop.DBus.Properties',
          member: 'PropertiesChanged',
        },
        (body) => {
          if (!NETWORK_TELEMETRY.safeParse(body).success) this.options.changed();
        },
      );
      this.stops.push(stop, () => {
        bus.close();
      });
      return true;
    } catch (cause) {
      this.failed(cause);
      bus.close();
      return false;
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.watch?.stop();
    for (const stop of this.stops.splice(0)) stop();
    await this.mdns?.close();
    this.mdns = null;
  }
  private failed(cause: unknown): void {
    if (!this.stopped)
      this.options.log.warn('route.events_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
  }
}
