import { watchAvahiNetwork, type NetworkCleanup } from './avahi-network';
import { addAvahiAddresses, addAvahiService } from './avahi-publication';
import type { AddressInfo } from 'node:net';
import { platform } from 'node:process';
import { type HubDiscoveryStatus, type HubIdentity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { SessionBus } from '../node/controls/linux/dbus-session';
import {
  AVAHI_DESTINATION as DESTINATION,
  AVAHI_SERVER as SERVER,
  DiscoveryError,
  DiscoveryCancelledError,
  avahiCall,
  avahiFree,
  avahiObject,
  avahiWatch,
  type DiscoveryBus,
} from './avahi-bus';
export type { DiscoveryBus } from './avahi-bus';

const GROUP_INTERFACE = `${DESTINATION}.EntryGroup`;
const GROUP_ESTABLISHED = 2;
const SERVER_RUNNING = 2;
const GROUP_FAILED = new Set([3, 4]);
const STATE_REPLY = z.tuple([z.int()]);
const STATE_SIGNAL = z.tuple([z.int(), z.string()]);
interface Generation {
  readonly generation: number;
  readonly signal: AbortSignal;
}

const OWNER_SIGNAL = z.tuple([z.string(), z.string(), z.string()]);

export interface AdvertisementOptions {
  readonly identity: HubIdentity;
  readonly listener: AddressInfo;
  readonly log: Logger;
  readonly changed: (status: HubDiscoveryStatus) => void;
  readonly bus?: () => DiscoveryBus;
  readonly networkChanged?: () => void;
}

export class AvahiAdvertisement {
  private readonly bus: DiscoveryBus;
  private group: string | null = null;
  private stopped = false;
  private daemonAvailable = true;
  private registering: Promise<void> | null = null;
  private generation = 0;
  private refreshRequested = false;
  private networkWatch: NetworkCleanup | null = null;
  private groupWatch: (() => void) | null = null;
  private generationController = new AbortController();
  private readonly lifetime = new AbortController();
  private readonly unwatch: (() => void)[] = [];

  constructor(private readonly options: AdvertisementOptions) {
    this.bus = options.bus === undefined ? SessionBus.system() : options.bus();
    this.bus.onError((cause) => {
      this.failed(cause);
    });
  }

  async start(): Promise<void> {
    if (this.stopped) return;
    this.options.changed({ state: 'starting', detail: 'Waiting for DNS-SD registration.' });
    try {
      await this.followDaemon();
      if (this.lifetime.signal.aborted) return;
      await this.followServer();
      await this.beginRegistration();
    } catch (cause) {
      this.failed(cause);
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.lifetime.abort();
    for (const stop of this.unwatch.splice(0)) stop();
    try {
      await this.endGeneration('stopped', true);
    } catch (cause) {
      this.options.log.warn('discovery.withdraw_failed', { reason: String(cause) });
    } finally {
      this.bus.close();
      this.options.changed({ state: 'disabled', detail: 'DNS-SD advertisement stopped.' });
    }
  }

  private async endGeneration(reason: string, releaseRemote: boolean): Promise<void> {
    this.generation += 1;
    this.generationController.abort(reason);
    this.generationController = new AbortController();
    this.refreshRequested = false;
    const group = this.group;
    const network = this.networkWatch;
    this.group = null;
    this.networkWatch = null;
    this.groupWatch?.();
    this.groupWatch = null;
    const releases: Promise<unknown>[] = [];
    if (network !== null) releases.push(network(releaseRemote));
    if (releaseRemote && group !== null) releases.push(avahiFree(this.bus, group, GROUP_INTERFACE));
    const results = await Promise.allSettled(releases);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }

  private async followDaemon(): Promise<void> {
    const stop = await avahiWatch(
      this.bus,
      { path: '/org/freedesktop/DBus', iface: 'org.freedesktop.DBus', member: 'NameOwnerChanged' },
      (body) => {
        const parsed = OWNER_SIGNAL.safeParse(body);
        if (!parsed.success) {
          this.failed(parsed.error);
          return;
        }
        const [name, _old, owner] = parsed.data;
        if (name !== DESTINATION || this.stopped) return;
        this.daemonAvailable = owner !== '';
        this.endGeneration('daemon', false).catch((cause: unknown) => {
          this.failed(cause);
        });
        if (owner === '') {
          this.options.changed({ state: 'unavailable', detail: 'Avahi is not running.' });
        } else {
          this.beginRegistration().catch((cause: unknown) => {
            this.failed(cause);
          });
        }
      },
      this.lifetime.signal,
    );
    if (this.stopped) stop();
    else this.unwatch.push(stop);
  }

  private async followServer(): Promise<void> {
    const stop = await avahiWatch(
      this.bus,
      { path: '/', iface: SERVER.iface, member: 'StateChanged' },
      (body) => {
        if (this.stopped || !this.daemonAvailable) return;
        const parsed = STATE_SIGNAL.safeParse(body);
        if (!parsed.success) {
          this.failed(parsed.error);
          return;
        }
        const work =
          parsed.data[0] === SERVER_RUNNING ? this.beginRegistration() : this.suspendRegistration();
        work.catch((cause: unknown) => {
          this.failed(cause);
        });
      },
      this.lifetime.signal,
    );
    if (this.stopped) stop();
    else this.unwatch.push(stop);
  }

  private async suspendRegistration(): Promise<void> {
    this.options.changed({
      state: 'starting',
      detail: 'The DNS-SD provider is updating its network state.',
    });
    await this.endGeneration('server', true);
  }

  private async register(generation: number, signal: AbortSignal): Promise<void> {
    this.requireCurrent(generation);
    const [state] = STATE_REPLY.parse(
      await avahiCall(this.bus, { ...SERVER, member: 'GetState' }, signal),
    );
    this.requireCurrent(generation);
    if (state !== SERVER_RUNNING) {
      this.options.changed({ state: 'starting', detail: 'Waiting for the local DNS-SD provider.' });
      return;
    }
    await avahiCall(this.bus, { ...SERVER, member: 'GetVersionString' }, signal);
    this.requireCurrent(generation);
    const path = await avahiObject(
      this.bus,
      { ...SERVER, member: 'EntryGroupNew' },
      {
        iface: GROUP_INTERFACE,
        signal,
        failed: (cause) => {
          if (this.isCurrent(generation)) this.failed(cause);
        },
      },
    );
    this.requireCurrent(generation);
    this.group = path;
    const stop = await avahiWatch(
      this.bus,
      { path, iface: GROUP_INTERFACE, member: 'StateChanged' },
      (body) => {
        if (!this.isCurrent(generation) || this.group !== path) return;
        const parsed = STATE_SIGNAL.safeParse(body);
        if (!parsed.success) {
          this.failed(parsed.error);
          return;
        }
        this.groupState(parsed.data[0], parsed.data[1], generation);
      },
      signal,
    );
    if (!this.isCurrent(generation)) {
      stop();
      return;
    }
    this.groupWatch = stop;
    await this.publish(generation, signal, false);
  }

  private isCurrent(generation: number): boolean {
    return !this.stopped && this.generation === generation && this.daemonAvailable;
  }

  private requireCurrent(generation: number): void {
    if (!this.isCurrent(generation)) throw new DiscoveryCancelledError();
  }

  private async followNetwork(generation: number, signal: AbortSignal): Promise<void> {
    if (this.networkWatch !== null) return;
    const stop = await watchAvahiNetwork(
      this.bus,
      () => {
        if (!this.isCurrent(generation)) return;
        this.options.networkChanged?.();
        this.refresh().catch((cause: unknown) => {
          if (this.isCurrent(generation)) this.failed(cause);
        });
      },
      (cause) => {
        if (this.isCurrent(generation)) this.failed(cause);
      },
      signal,
    );
    if (!this.isCurrent(generation)) {
      await stop(false);
      return;
    }
    this.networkWatch = stop;
  }

  private beginRegistration(): Promise<void> {
    if (this.stopped || !this.daemonAvailable) return Promise.resolve();
    if (this.registering !== null) {
      this.refreshRequested = true;
      return this.registering;
    }
    return this.track(this.group !== null);
  }

  private track(refresh: boolean): Promise<void> {
    const generation = this.generation;
    const signal = this.generationController.signal;
    const work = refresh
      ? this.publish(generation, signal, true)
      : this.register(generation, signal);
    this.registering = work
      .catch((cause: unknown) => {
        if (this.isCurrent(generation)) this.failed(cause);
      })
      .finally(() => {
        this.registering = null;
        this.continuePending(generation);
      });
    return this.registering;
  }

  private continuePending(generation: number): void {
    if (this.stopped || !this.daemonAvailable) return;
    if (this.generation !== generation || this.refreshRequested) {
      this.refreshRequested = false;
      this.beginRegistration().catch((cause: unknown) => {
        this.failed(cause);
      });
    }
  }

  private async refresh(): Promise<void> {
    if (this.stopped || !this.daemonAvailable) return;
    if (this.registering !== null) {
      this.refreshRequested = true;
      return;
    }
    await this.beginRegistration();
  }

  private async publish(generation: number, signal: AbortSignal, reset: boolean): Promise<void> {
    this.requireCurrent(generation);
    await this.followNetwork(generation, signal);
    this.requireCurrent(generation);
    const groupCall = (
      member: string,
      signature?: string,
      body?: readonly unknown[],
    ): Promise<readonly unknown[]> =>
      this.groupCall({ generation, signal }, member, signature, body);
    if (reset) await groupCall('Reset');
    const options = { ...this.options, bus: this.bus, signal, groupCall };
    await addAvahiAddresses(options);
    this.requireCurrent(generation);
    await addAvahiService(options);
    this.requireCurrent(generation);
    await groupCall('Commit');
    const [state] = STATE_REPLY.parse(await groupCall('GetState'));
    this.groupState(state, '', generation);
  }

  private async groupCall(
    scope: Generation,
    member: string,
    signature?: string,
    body?: readonly unknown[],
  ): Promise<readonly unknown[]> {
    const { generation, signal } = scope;
    this.requireCurrent(generation);
    if (this.group === null) throw new DiscoveryError(member, 'there is no registration group');
    const result = await avahiCall(
      this.bus,
      {
        destination: DESTINATION,
        path: this.group,
        iface: GROUP_INTERFACE,
        member,
        ...(signature === undefined ? {} : { signature }),
        ...(body === undefined ? {} : { body }),
      },
      signal,
    );
    this.requireCurrent(generation);
    return result;
  }

  private groupState(state: number, error: string, generation: number): void {
    if (!this.isCurrent(generation)) return;
    if (state === GROUP_ESTABLISHED) {
      this.options.changed({
        state: 'advertising',
        detail: 'Encrypted LAN listener advertised through Avahi.',
      });
    } else if (GROUP_FAILED.has(state)) {
      this.failed(
        new DiscoveryError('registration', error === '' ? `state ${String(state)}` : error),
      );
    }
  }

  private failed(cause: unknown): void {
    if (this.stopped || cause instanceof DiscoveryCancelledError) return;
    this.options.changed({
      state: 'unavailable',
      detail: 'DNS-SD unavailable; use a trusted invitation or QR.',
    });
    this.options.log.warn('discovery.unavailable', {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export async function advertiseHub(options: AdvertisementOptions): Promise<() => Promise<void>> {
  if (platform !== 'linux' && options.bus === undefined) {
    options.changed({ state: 'unavailable', detail: 'DNS-SD has no provider on this platform.' });
    return () => Promise.resolve();
  }
  try {
    const advertisement = new AvahiAdvertisement(options);
    await advertisement.start();
    return () => advertisement.stop();
  } catch (cause) {
    options.changed({ state: 'unavailable', detail: 'DNS-SD provider could not be opened.' });
    options.log.warn('discovery.unavailable', {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return () => Promise.resolve();
  }
}
