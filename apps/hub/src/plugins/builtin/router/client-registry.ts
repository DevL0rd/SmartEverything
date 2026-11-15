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

export interface ClientLink {
  readonly profileId: string | null;
  readonly personId: string | null;
}

interface Presence {
  readonly client: KnownClient;
  readonly lostAt: number | null;
  readonly seenAt: number | null;
}

function knownFrom(
  client: NetworkClient,
  previous: KnownClient | undefined,
  at: string,
): KnownClient {
  if (previous === undefined) {
    return {
      mac: client.mac,
      name: client.name,
      profileId: null,
      personId: null,
      firstSeen: at,
      lastSeen: at,
      present: true,
    };
  }
  if (previous.present && previous.name === client.name) {
    return previous;
  }
  return {
    ...previous,
    name: client.name,
    lastSeen: previous.present ? previous.lastSeen : at,
    present: true,
  };
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
        this.#presence.set(key, { client: parsed.data, lostAt: null, seenAt: null });
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
    this.#expire(connected, now.getTime());
    const merged = clients.map((client) => this.#track(client, now));
    return [...merged, ...this.#offlineKnown(seen)];
  }

  assign(mac: string, link: ClientLink): KnownClient | null {
    const presence = this.#presence.get(mac);
    if (presence === undefined) {
      return null;
    }
    const client = { ...presence.client, ...link };
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
    const known = knownFrom(client, previous?.client, now.toISOString());
    const presence = { client: known, lostAt: null, seenAt: now.getTime() };
    if (previous?.client.present !== true) {
      this.#store(presence);
      this.#announce(CLIENT_JOINED_EVENT, known);
    } else {
      this.#presence.set(client.mac, presence);
    }
    return this.#withKnown(client, known);
  }

  #expire(connected: ReadonlySet<string>, now: number): void {
    for (const [mac, presence] of this.#presence) {
      if (connected.has(mac) || !presence.client.present) {
        continue;
      }
      const lost = presence.lostAt === null ? this.#lost(presence, now) : presence;
      const lostAt = lost.lostAt ?? now;
      if (now - lostAt >= CLIENT_LEFT_AFTER_MS) {
        const client = { ...lost.client, present: false };
        this.#store({ client, lostAt: null, seenAt: null });
        this.#announce(CLIENT_LEFT_EVENT, client);
      } else {
        this.#presence.set(mac, lost);
      }
    }
  }

  #lost(presence: Presence, now: number): Presence {
    const client =
      presence.seenAt === null
        ? presence.client
        : { ...presence.client, lastSeen: new Date(presence.seenAt).toISOString() };
    return { client, lostAt: now, seenAt: null };
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
        personId: client.personId,
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
      personId: known.personId,
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
      data: {
        mac: client.mac,
        name: client.name,
        profile_id: client.profileId,
        person_id: client.profileId ?? client.personId,
      },
    });
  }
}
