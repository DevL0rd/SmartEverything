import {
  SOCKET_BACK_PRESSURE_BYTES,
  type ClientRow,
  type ComputerLiveNotice,
  type ComputerPartsUpdate,
  type BrushLiveNotice,
  type PhoneDetailNotice,
  type TreadmillLiveNotice,
  type ProcessWindow,
  mergeProcessUpdates,
  type AutomationTraceNotice,
  type AutomationWatchMessage,
  type TraceNodeStateNotice,
  type WatchDemand,
  type WatchMessage,
  TRACE_TOPIC,
  demandSubject,
  traceSubject,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { pickParts } from '../computers/computer-view';
import { deviceTarget, type ViewLease, type Viewers } from '../metrics/viewers';
import type { WebSocket } from 'ws';

export type DeviceNotice =
  ComputerLiveNotice | PhoneDetailNotice | TreadmillLiveNotice | BrushLiveNotice;

export type WatchNotice = DeviceNotice;

type AnyNotice = DeviceNotice | AutomationTraceNotice;

export interface TraceSource {
  readonly viewers: Pick<Viewers<ProcessWindow>, 'hold' | 'release'>;
  readonly allowed: (client: ClientRow, subject: string) => boolean;
  readonly keyframe: (subject: string, client: ClientRow) => AutomationTraceNotice | null;
}

export interface WatchSource {
  readonly viewers: Pick<Viewers<ProcessWindow>, 'hold' | 'release'>;
  readonly allowed: (client: ClientRow, deviceId: string) => boolean;
  readonly keyframe: (deviceId: string, client: ClientRow) => DeviceNotice | null;
}

export interface WatchConnection {
  readonly id: number;
  readonly client: ClientRow;
  readonly socket: Pick<WebSocket, 'bufferedAmount'>;
}

export interface LiveWatchOptions<Subscriber extends WatchConnection> {
  readonly send: (connection: Subscriber, notice: WatchNotice) => void;
  readonly sendTrace?: (connection: Subscriber, notice: AutomationTraceNotice) => void;
  readonly log: Logger;
}

type Topics = ReadonlyMap<string, ReadonlySet<string>>;

interface Family {
  readonly topics: Topics;
  readonly leases: readonly ViewLease<ProcessWindow>[];
}

type FamilyName = 'devices' | 'traces';

interface Watching {
  readonly devices: Family;
  readonly traces: Family;
  readonly topics: Topics;
  readonly pending: Map<string, WatchNotice>;
  readonly traceNodes: Map<string, TraceNodeStateNotice>;
}

const NO_TOPICS: Topics = new Map();
const NO_FAMILY: Family = { topics: NO_TOPICS, leases: [] };

function isTrace(notice: AnyNotice): notice is AutomationTraceNotice {
  return notice.type.startsWith('trace_');
}

function subjectsOf(notice: AnyNotice): string[] {
  if (!isTrace(notice)) return [deviceTarget(notice.deviceId)];
  return 'runId' in notice
    ? [traceSubject('automation', notice.automationId), traceSubject('run', notice.runId)]
    : [traceSubject('automation', notice.automationId)];
}

function topicsFor(known: Topics, subjects: readonly string[]): ReadonlySet<string> | undefined {
  for (const subject of subjects) {
    const topics = known.get(subject);
    if (topics !== undefined) return topics;
  }
  return undefined;
}

function traceNodeKey(notice: TraceNodeStateNotice): string {
  return `${notice.runId}\u0000${notice.path}`;
}

function withFamily(known: Watching | undefined, name: FamilyName, family: Family): Watching {
  const base: Watching = known ?? {
    devices: NO_FAMILY,
    traces: NO_FAMILY,
    topics: NO_TOPICS,
    pending: new Map<string, WatchNotice>(),
    traceNodes: new Map<string, TraceNodeStateNotice>(),
  };
  const devices = name === 'devices' ? family : base.devices;
  const traces = name === 'traces' ? family : base.traces;
  return { ...base, devices, traces, topics: allTopics(devices.topics, traces.topics) };
}

function allTopics(devices: Topics, traces: Topics): Topics {
  return new Map([...devices, ...traces]);
}

function holderOf(connection: WatchConnection): string {
  return `live:${String(connection.id)}`;
}

function topicsOf(demands: readonly WatchDemand[]): Map<string, Set<string>> {
  const topics = new Map<string, Set<string>>();
  for (const demand of demands) {
    const subject = deviceTarget(demand.deviceId);
    const known = topics.get(subject) ?? new Set<string>();
    demand.topics.forEach((topic) => known.add(topic));
    topics.set(subject, known);
  }
  return topics;
}

function traceLeasesOf(subjects: Iterable<string>): ViewLease<ProcessWindow>[] {
  return [...subjects].map((subject) => ({ target: subject, topic: TRACE_TOPIC }));
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

function covered(notice: AnyNotice, topics: ReadonlySet<string>): AnyNotice | null {
  if (isTrace(notice)) return topics.has(TRACE_TOPIC) ? notice : null;
  if (
    notice.type === 'phone_detail' ||
    notice.type === 'treadmill_live' ||
    notice.type === 'toothbrush_live'
  ) {
    return topics.has(PHONE_DETAIL_TOPIC) ? notice : null;
  }
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

function merged(older: WatchNotice | undefined, newer: DeviceNotice): WatchNotice {
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
  private readonly traceSources = new Set<TraceSource>();
  private readonly watching = new Map<Subscriber, Watching>();

  constructor(private readonly options: LiveWatchOptions<Subscriber>) {}

  attach(source: WatchSource): () => void {
    this.sources.add(source);
    return (): void => {
      this.sources.delete(source);
    };
  }

  attachTrace(source: TraceSource): () => void {
    this.traceSources.add(source);
    return (): void => {
      this.traceSources.delete(source);
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
    const topics = topicsOf(demands);
    this.replace(connection, 'devices', { topics, leases: leasesOf(demands) });
    this.options.log.debug('live.watch_changed', () => ({
      socketId: connection.id,
      clientId: connection.client.id,
      devices: topics.size,
      topics: demands.reduce((count, demand) => count + demand.topics.length, 0),
      denied: message.demands.length - demands.length,
    }));
  }

  receiveTrace(connection: Subscriber, message: AutomationWatchMessage): void {
    const sources = [...this.traceSources];
    if (sources.length === 0 || this.options.sendTrace === undefined) {
      this.options.log.warn('live.trace_unwired', {
        socketId: connection.id,
        sources: sources.length,
        sender: this.options.sendTrace !== undefined,
      });
      return;
    }
    const subjects = new Set(
      message.demands
        .map(demandSubject)
        .filter((subject) => sources.some((source) => source.allowed(connection.client, subject))),
    );
    this.replace(connection, 'traces', {
      topics: new Map([...subjects].map((subject) => [subject, new Set([TRACE_TOPIC])])),
      leases: traceLeasesOf(subjects),
    });
    this.options.log.debug('live.trace_watch_changed', () => ({
      socketId: connection.id,
      clientId: connection.client.id,
      subjects: subjects.size,
      denied: message.demands.length - subjects.size,
    }));
  }

  close(connection: Subscriber): void {
    if (!this.watching.delete(connection)) return;
    this.viewersOf().forEach((viewers) => {
      viewers.release(holderOf(connection));
    });
  }

  publish(notice: AnyNotice): void {
    const subjects = subjectsOf(notice);
    for (const [connection, watching] of this.watching) {
      const topics = topicsFor(watching.topics, subjects);
      const wanted = topics === undefined ? null : covered(notice, topics);
      if (wanted !== null) this.deliver(connection, watching, wanted);
    }
  }

  publishEach(deviceId: string, noticeFor: (client: ClientRow) => DeviceNotice | null): void {
    for (const [connection, watching] of this.watching) {
      const topics = watching.topics.get(deviceTarget(deviceId));
      if (topics === undefined) continue;
      const notice = noticeFor(connection.client);
      const wanted = notice === null ? null : covered(notice, topics);
      if (wanted !== null) this.deliver(connection, watching, wanted);
    }
  }

  private viewersOf(): Set<Pick<Viewers<ProcessWindow>, 'hold' | 'release'>> {
    return new Set([
      ...[...this.sources].map((source) => source.viewers),
      ...[...this.traceSources].map((source) => source.viewers),
    ]);
  }

  private replace(connection: Subscriber, name: FamilyName, family: Family): void {
    const known = this.watching.get(connection);
    const before = known?.topics ?? NO_TOPICS;
    const next = withFamily(known, name, family);
    this.watching.set(connection, next);
    this.hold(connection, next);
    this.sendKeyframes(connection, before, next.topics);
  }

  private hold(connection: Subscriber, watching: Watching): void {
    const holder = holderOf(connection);
    const deviceViewers = new Set([...this.sources].map((source) => source.viewers));
    const traceViewers = new Set([...this.traceSources].map((source) => source.viewers));
    for (const viewers of new Set([...deviceViewers, ...traceViewers])) {
      const leases: ViewLease<ProcessWindow>[] = [
        ...(deviceViewers.has(viewers) ? watching.devices.leases : []),
        ...(traceViewers.has(viewers) ? watching.traces.leases : []),
      ];
      viewers.hold(holder, leases);
    }
  }

  private sendKeyframes(connection: Subscriber, before: Topics, topics: Topics): void {
    for (const [subject, wanted] of topics) {
      const fresh = new Set(
        [...wanted].filter((topic) => before.get(subject)?.has(topic) !== true),
      );
      if (fresh.size === 0) continue;
      const keyframe = this.keyframeOf(subject, connection.client);
      const cut = keyframe === null ? null : covered(keyframe, fresh);
      if (cut !== null) this.emit(connection, cut);
    }
  }

  private keyframeOf(subject: string, client: ClientRow): AnyNotice | null {
    if (!subject.startsWith('device:')) return this.traceKeyframeOf(subject, client);
    const deviceId = subject.slice('device:'.length);
    for (const source of this.sources) {
      const keyframe = source.keyframe(deviceId, client);
      if (keyframe !== null) return keyframe;
    }
    return null;
  }

  private traceKeyframeOf(subject: string, client: ClientRow): AutomationTraceNotice | null {
    for (const source of this.traceSources) {
      const keyframe = source.keyframe(subject, client);
      if (keyframe !== null) return keyframe;
    }
    return null;
  }

  private deliver(connection: Subscriber, watching: Watching, notice: AnyNotice): void {
    if (isTrace(notice)) {
      this.deliverTrace(connection, watching, notice);
      return;
    }
    const key = notice.deviceId;
    const waiting = merged(watching.pending.get(key), notice);
    if (connection.socket.bufferedAmount > SOCKET_BACK_PRESSURE_BYTES) {
      watching.pending.set(key, waiting);
      return;
    }
    watching.pending.delete(key);
    this.options.send(connection, waiting);
  }

  private deliverTrace(
    connection: Subscriber,
    watching: Watching,
    notice: AutomationTraceNotice,
  ): void {
    if (notice.type === 'trace_node_state') {
      watching.traceNodes.set(traceNodeKey(notice), notice);
      if (connection.socket.bufferedAmount <= SOCKET_BACK_PRESSURE_BYTES) {
        this.flushTrace(connection, watching);
      }
      return;
    }
    this.flushTrace(connection, watching);
    this.emit(connection, notice);
  }

  private emit(connection: Subscriber, notice: AnyNotice): void {
    if (isTrace(notice)) this.options.sendTrace?.(connection, notice);
    else this.options.send(connection, notice);
  }

  private flushTrace(connection: Subscriber, watching: Watching): void {
    const waiting = [...watching.traceNodes.values()];
    watching.traceNodes.clear();
    waiting.forEach((notice) => {
      this.emit(connection, notice);
    });
  }
}
