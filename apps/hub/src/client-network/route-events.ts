import { platform } from 'node:os';
import { isIP } from 'node:net';
import { z } from 'zod';
import { type HubDiscoveryCandidate, HUB_DISCOVERY_CANDIDATE } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { SessionBus } from '../node/controls/linux/dbus-session';
import { avahiCall, avahiObject, avahiWatch, type DiscoveryBus } from '../network/avahi-bus';

const DISCOVERY_WINDOW_MS = 30_000;
const MAX_DISCOVERY_ENTRIES = 64;
const MAX_DISCOVERY_RESOLVERS = 4;
const DESTINATION = 'org.freedesktop.Avahi';
const BROWSER = `${DESTINATION}.ServiceBrowser`;
const ITEM = z.tuple([
  z.int(),
  z.int(),
  z.string().max(63),
  z.literal('_smarteverything._tcp'),
  z.string().max(100),
  z.int(),
]);
const RESOLVED = z.tuple([
  z.int(),
  z.int(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.int(),
  z.string(),
  z.int().min(1).max(65535),
  z.array(z.instanceof(Buffer)).max(128),
  z.int(),
]);

export class NodeRouteEvents {
  private bus: DiscoveryBus | null = null;
  private readonly lifetime = new AbortController();
  private discovery = new AbortController();
  private timer: NodeJS.Timeout | null = null;
  private readonly stops: (() => void)[] = [];
  private readonly visible = new Map<string, number>();
  private readonly queued = new Map<
    string,
    { readonly item: z.infer<typeof ITEM>; readonly incarnation: number }
  >();
  private incarnation = 0;
  private pending = 0;
  constructor(
    private readonly options: {
      readonly changed: () => void;
      readonly discovered: (candidate: HubDiscoveryCandidate) => void;
      readonly log: Logger;
      readonly bus?: () => DiscoveryBus;
    },
  ) {}
  async start(discoveryEnabled: boolean): Promise<void> {
    if (platform() !== 'linux') {
      this.options.log.warn('route.events_unsupported', { platform: platform() });
      return;
    }
    try {
      this.bus = this.options.bus === undefined ? SessionBus.system() : this.options.bus();
      this.bus.onError((cause) => {
        this.failed(cause);
      });
      await this.followNetwork(this.bus);
      if (discoveryEnabled) await this.discover();
    } catch (cause) {
      this.failed(cause);
    }
  }
  private async followNetwork(bus: DiscoveryBus): Promise<void> {
    try {
      await avahiCall(
        bus,
        {
          destination: 'org.freedesktop.DBus',
          path: '/org/freedesktop/DBus',
          iface: 'org.freedesktop.DBus',
          member: 'GetNameOwner',
          signature: 's',
          body: ['org.freedesktop.NetworkManager'],
        },
        this.lifetime.signal,
      );
      const stop = await avahiWatch(
        bus,
        {
          sender: 'org.freedesktop.NetworkManager',
          iface: 'org.freedesktop.DBus.Properties',
          member: 'PropertiesChanged',
        },
        () => {
          this.options.changed();
        },
        this.lifetime.signal,
      );
      this.stops.push(stop);
    } catch (cause) {
      this.failed(cause);
    }
  }
  async discover(): Promise<void> {
    const bus = this.bus;
    if (bus === null || this.lifetime.signal.aborted) return;
    this.discovery.abort();
    this.discovery = new AbortController();
    const signal = AbortSignal.any([this.discovery.signal, this.lifetime.signal]);
    clearTimeout(this.timer ?? undefined);
    this.visible.clear();
    this.queued.clear();
    this.timer = setTimeout(() => {
      this.discovery.abort();
    }, DISCOVERY_WINDOW_MS);
    this.timer.unref();
    try {
      await this.browser(bus, signal);
    } catch (cause) {
      if (!signal.aborted) this.failed(cause);
    }
  }
  private async browser(bus: DiscoveryBus, signal: AbortSignal): Promise<void> {
    const path = await avahiObject(
      bus,
      {
        destination: DESTINATION,
        path: '/',
        iface: `${DESTINATION}.Server2`,
        member: 'ServiceBrowserPrepare',
        signature: 'iissu',
        body: [-1, -1, '_smarteverything._tcp', 'local', 0],
      },
      {
        iface: BROWSER,
        signal,
        failed: (cause) => {
          this.failed(cause);
        },
      },
    );
    signal.addEventListener(
      'abort',
      () => {
        void avahiCall(bus, {
          destination: DESTINATION,
          path,
          iface: BROWSER,
          member: 'Free',
        }).catch((cause: unknown) => {
          if (!this.lifetime.signal.aborted) this.failed(cause);
        });
      },
      { once: true },
    );
    for (const member of ['ItemNew', 'ItemRemove']) {
      const stop = await avahiWatch(
        bus,
        { sender: DESTINATION, path, iface: BROWSER, member },
        (body) => {
          this.item(bus, member, body, signal);
        },
        signal,
      );
      signal.addEventListener('abort', stop, { once: true });
    }
    await avahiCall(
      bus,
      { destination: DESTINATION, path, iface: BROWSER, member: 'Start' },
      signal,
    );
  }
  private item(
    bus: DiscoveryBus,
    member: string,
    body: readonly unknown[],
    signal: AbortSignal,
  ): void {
    const parsed = ITEM.safeParse(body);
    if (!parsed.success || signal.aborted) return;
    const key = parsed.data.slice(0, 5).join('|');
    if (member === 'ItemRemove') {
      this.visible.delete(key);
      this.queued.delete(key);
      return;
    }
    if (!this.visible.has(key) && this.visible.size >= MAX_DISCOVERY_ENTRIES) return;
    const incarnation = ++this.incarnation;
    this.visible.set(key, incarnation);
    this.queued.set(key, { item: parsed.data, incarnation });
    this.drain(bus, signal);
  }
  private drain(bus: DiscoveryBus, signal: AbortSignal): void {
    if (signal.aborted) return;
    for (const [key, entry] of this.queued) {
      if (this.pending >= MAX_DISCOVERY_RESOLVERS) return;
      this.queued.delete(key);
      this.pending += 1;
      void this.resolve(bus, entry.item, signal)
        .then((candidate) => {
          if (!signal.aborted && candidate !== null && this.visible.get(key) === entry.incarnation)
            this.options.discovered(candidate);
        })
        .catch((cause: unknown) => {
          if (!signal.aborted) this.failed(cause);
        })
        .finally(() => {
          this.pending -= 1;
          this.drain(bus, signal);
        });
    }
  }
  private async resolve(
    bus: DiscoveryBus,
    item: z.infer<typeof ITEM>,
    signal: AbortSignal,
  ): Promise<HubDiscoveryCandidate | null> {
    const [network, protocol, name, type, domain] = item;
    const reply = RESOLVED.parse(
      await avahiCall(
        bus,
        {
          destination: DESTINATION,
          path: '/',
          iface: `${DESTINATION}.Server`,
          member: 'ResolveService',
          signature: 'iisssiu',
          body: [network, protocol, name, type, domain, -1, 0],
        },
        signal,
      ),
    );
    const txt = reply[9].map((bytes) => bytes.toString('utf8'));
    const id = txt.find((entry) => entry.startsWith('id='));
    const address = reply[7];
    if (
      id === undefined ||
      isIP(address) === 0 ||
      !txt.includes('protocol=1') ||
      !txt.includes('tls=1')
    )
      return null;
    return HUB_DISCOVERY_CANDIDATE.parse({
      name: reply[2],
      url: `https://${address.includes(':') ? `[${address}]` : address}:${String(reply[8])}`,
      hubId: id.slice(3),
      protocolVersion: 1,
    });
  }
  stop(): void {
    this.lifetime.abort();
    this.discovery.abort();
    clearTimeout(this.timer ?? undefined);
    for (const stop of this.stops.splice(0)) stop();
    this.bus?.close();
    this.bus = null;
  }
  private failed(cause: unknown): void {
    if (!this.lifetime.signal.aborted)
      this.options.log.warn('route.events_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
  }
}
