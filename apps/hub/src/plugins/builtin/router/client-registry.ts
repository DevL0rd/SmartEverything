import {
  KNOWN_CLIENT,
  type KnownClient,
  type NetworkClient,
  type PluginEvent,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PluginRecords } from '../contract';

const CLIENT_LEFT_AFTER_MS = 5 * 60 * 1000;
export const CLIENT_JOINED_EVENT = 'network_client_joined';
export const CLIENT_LEFT_EVENT = 'network_client_left';

interface Presence {
  readonly client: KnownClient;
  readonly lostAt: number | null;
}

export class ClientRegistry {
  readonly #presence = new Map<string, Presence>();

  constructor(
    private readonly records: PluginRecords,
    private readonly emit: (event: PluginEvent) => void,
    log: Logger,
  ) {
    for (const { key, value } of records.list()) {
      const parsed = KNOWN_CLIENT.safeParse(value);
      if (parsed.success) {
        this.#presence.set(key, { client: { ...parsed.data, present: false }, lostAt: null });
      } else {
        log.warn('router.client_record_invalid', { key });
      }
    }
  }

  observe(clients: readonly NetworkClient[], now: Date): NetworkClient[] {
    const seen = new Set(clients.map((client) => client.mac));
    const connected = new Set(
      clients.filter((client) => client.connected).map((client) => client.mac),
    );
    const merged = clients.map((client) => this.#track(client, now));
    this.#expire(connected, now.getTime());
    return [...merged, ...this.#offlineKnown(seen)];
  }

  assign(mac: string, profileId: string | null): KnownClient | null {
    const presence = this.#presence.get(mac);
    if (presence === undefined) {
      return null;
    }
    const client = { ...presence.client, profileId };
    this.#store({ ...presence, client });
    return client;
  }

  known(): KnownClient[] {
    return [...this.#presence.values()].map((presence) => presence.client);
  }

  #track(client: NetworkClient, now: Date): NetworkClient {
    const previous = this.#presence.get(client.mac);
    if (!client.connected) {
      return this.#withKnown(client, previous?.client);
    }
    const at = now.toISOString();
    const known: KnownClient = {
      mac: client.mac,
      name: client.name,
      profileId: previous?.client.profileId ?? null,
      firstSeen: previous?.client.firstSeen ?? at,
      lastSeen: at,
      present: true,
    };
    if (previous?.client.present !== true) {
      this.#store({ client: known, lostAt: null });
      this.#announce(CLIENT_JOINED_EVENT, known);
    } else {
      this.#presence.set(client.mac, { client: known, lostAt: null });
    }
    return this.#withKnown(client, known);
  }

  #expire(connected: ReadonlySet<string>, now: number): void {
    for (const [mac, presence] of this.#presence) {
      if (connected.has(mac) || !presence.client.present) {
        continue;
      }
      const lostAt = presence.lostAt ?? now;
      if (now - lostAt >= CLIENT_LEFT_AFTER_MS) {
        const client = { ...presence.client, present: false };
        this.#store({ client, lostAt: null });
        this.#announce(CLIENT_LEFT_EVENT, client);
      } else {
        this.#presence.set(mac, { ...presence, lostAt });
      }
    }
  }

  #offlineKnown(seen: ReadonlySet<string>): NetworkClient[] {
    return [...this.#presence.values()]
      .filter((presence) => !seen.has(presence.client.mac))
      .map(({ client }) => ({
        mac: client.mac,
        name: client.name,
        ip: null,
        connection: null,
        band: null,
        connected: false,
        blocked: false,
        trafficBytesPerSecond: null,
        profileId: client.profileId,
        firstSeen: client.firstSeen,
        lastSeen: client.lastSeen,
      }));
  }

  #withKnown(client: NetworkClient, known: KnownClient | undefined): NetworkClient {
    if (known === undefined) {
      return client;
    }
    return {
      ...client,
      profileId: known.profileId,
      firstSeen: known.firstSeen,
      lastSeen: known.lastSeen,
    };
  }

  #store(presence: Presence): void {
    this.#presence.set(presence.client.mac, presence);
    this.records.put(presence.client.mac, { ...presence.client });
  }

  #announce(kind: string, client: KnownClient): void {
    this.emit({
      kind,
      subject: client.name,
      data: { mac: client.mac, name: client.name, profile_id: client.profileId },
    });
  }
}
