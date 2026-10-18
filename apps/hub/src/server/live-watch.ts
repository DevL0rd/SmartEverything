import {
  SOCKET_BACK_PRESSURE_BYTES,
  type ClientRow,
  type ComputerLiveNotice,
  type ComputerPartsUpdate,
  type PhoneDetailNotice,
  type ProcessWindow,
  mergeProcessUpdates,
  type WatchDemand,
  type WatchMessage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { pickParts } from '../computers/computer-view';
import { deviceTarget, type ViewLease, type Viewers } from '../metrics/viewers';
import type { WebSocket } from 'ws';

export type WatchNotice = ComputerLiveNotice | PhoneDetailNotice;

export interface WatchSource {
  readonly viewers: Pick<Viewers<ProcessWindow>, 'hold' | 'release'>;
  readonly allowed: (client: ClientRow, deviceId: string) => boolean;
  readonly keyframe: (deviceId: string, client: ClientRow) => WatchNotice | null;
}

export interface WatchConnection {
  readonly id: number;
  readonly client: ClientRow;
  readonly socket: Pick<WebSocket, 'bufferedAmount'>;
}

export interface LiveWatchOptions<Subscriber extends WatchConnection> {
  readonly send: (connection: Subscriber, notice: WatchNotice) => void;
  readonly log: Logger;
}

interface Watching {
  readonly topics: ReadonlyMap<string, ReadonlySet<string>>;
  readonly pending: Map<string, WatchNotice>;
}

const NO_TOPICS: ReadonlyMap<string, ReadonlySet<string>> = new Map();

function holderOf(connection: WatchConnection): string {
  return `live:${String(connection.id)}`;
}

function topicsOf(demands: readonly WatchDemand[]): Map<string, Set<string>> {
  const topics = new Map<string, Set<string>>();
  for (const demand of demands) {
    const known = topics.get(demand.deviceId) ?? new Set<string>();
    demand.topics.forEach((topic) => known.add(topic));
    topics.set(demand.deviceId, known);
  }
  return topics;
}

function leasesOf(demands: readonly WatchDemand[]): ViewLease<ProcessWindow>[] {
  return demands.flatMap((demand) =>
    demand.topics.map((topic) => ({
      target: deviceTarget(demand.deviceId),
      topic,
      ...(topic === 'processes' && demand.processes !== undefined
        ? { detail: demand.processes }
        : {}),
    })),
  );
}

const PHONE_DETAIL_TOPIC = 'live';

function coveredParts(
  parts: ComputerPartsUpdate,
  topics: ReadonlySet<string>,
): ComputerPartsUpdate {
  return pickParts(parts, (name) => name === 'session' || topics.has(name));
}

function covered(notice: WatchNotice, topics: ReadonlySet<string>): WatchNotice | null {
  if (notice.type === 'phone_detail') return topics.has(PHONE_DETAIL_TOPIC) ? notice : null;
  const parts = coveredParts(notice.parts, topics);
  return Object.keys(parts).length === 0 ? null : { ...notice, parts };
}

function mergedComputer(older: ComputerLiveNotice, newer: ComputerLiveNotice): ComputerLiveNotice {
  const { processes: before, ...olderRest } = older.parts;
  const { processes: now, ...newerRest } = newer.parts;
  const processes =
    before !== undefined && now !== undefined ? mergeProcessUpdates(before, now) : (now ?? before);
  return {
    ...newer,
    parts: { ...olderRest, ...newerRest, ...(processes === undefined ? {} : { processes }) },
  };
}

function merged(older: WatchNotice | undefined, newer: WatchNotice): WatchNotice {
  if (older?.type === 'computer_live' && newer.type === 'computer_live') {
    return mergedComputer(older, newer);
  }
  if (older?.type === 'phone_detail' && newer.type === 'phone_detail') {
    return { ...newer, parts: { ...older.parts, ...newer.parts } };
  }
  return newer;
}

export class LiveWatch<Subscriber extends WatchConnection> {
  private readonly sources = new Set<WatchSource>();
  private readonly watching = new Map<Subscriber, Watching>();

  constructor(private readonly options: LiveWatchOptions<Subscriber>) {}

  attach(source: WatchSource): () => void {
    this.sources.add(source);
    return (): void => {
      this.sources.delete(source);
    };
  }

  receive(connection: Subscriber, message: WatchMessage): void {
    const sources = [...this.sources];
    if (sources.length === 0) {
      this.options.log.warn('live.watch_unattached', { socketId: connection.id });
      return;
    }
    const demands = message.demands.filter((demand) =>
      sources.some((source) => source.allowed(connection.client, demand.deviceId)),
    );
    const before = this.watching.get(connection)?.topics ?? NO_TOPICS;
    const topics = topicsOf(demands);
    new Set(sources.map((source) => source.viewers)).forEach((viewers) => {
      viewers.hold(holderOf(connection), leasesOf(demands));
    });
    const pending = this.watching.get(connection)?.pending ?? new Map<string, WatchNotice>();
    this.watching.set(connection, { topics, pending });
    this.options.log.debug('live.watch_changed', () => ({
      socketId: connection.id,
      clientId: connection.client.id,
      devices: topics.size,
      topics: demands.reduce((count, demand) => count + demand.topics.length, 0),
      denied: message.demands.length - demands.length,
    }));
    this.sendKeyframes(connection, before, topics);
  }

  close(connection: Subscriber): void {
    if (!this.watching.delete(connection)) return;
    new Set([...this.sources].map((source) => source.viewers)).forEach((viewers) => {
      viewers.release(holderOf(connection));
    });
  }

  publish(notice: WatchNotice): void {
    this.publishEach(notice.deviceId, () => notice);
  }

  publishEach(deviceId: string, noticeFor: (client: ClientRow) => WatchNotice | null): void {
    for (const [connection, watching] of this.watching) {
      const topics = watching.topics.get(deviceId);
      if (topics === undefined) continue;
      const notice = noticeFor(connection.client);
      const wanted = notice === null ? null : covered(notice, topics);
      if (wanted !== null) this.deliver(connection, watching, wanted);
    }
  }

  private sendKeyframes(
    connection: Subscriber,
    before: ReadonlyMap<string, ReadonlySet<string>>,
    topics: ReadonlyMap<string, ReadonlySet<string>>,
  ): void {
    for (const [deviceId, wanted] of topics) {
      const fresh = new Set(
        [...wanted].filter((topic) => before.get(deviceId)?.has(topic) !== true),
      );
      if (fresh.size === 0) continue;
      const keyframe = this.keyframeOf(deviceId, connection.client);
      const cut = keyframe === null ? null : covered(keyframe, fresh);
      if (cut !== null) this.options.send(connection, cut);
    }
  }

  private keyframeOf(deviceId: string, client: ClientRow): WatchNotice | null {
    for (const source of this.sources) {
      const keyframe = source.keyframe(deviceId, client);
      if (keyframe !== null) return keyframe;
    }
    return null;
  }

  private deliver(connection: Subscriber, watching: Watching, notice: WatchNotice): void {
    const waiting = merged(watching.pending.get(notice.deviceId), notice);
    if (connection.socket.bufferedAmount > SOCKET_BACK_PRESSURE_BYTES) {
      watching.pending.set(notice.deviceId, waiting);
      return;
    }
    watching.pending.delete(notice.deviceId);
    this.options.send(connection, waiting);
  }
}
