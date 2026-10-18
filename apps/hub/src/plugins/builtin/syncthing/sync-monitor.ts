import type { PluginEvent, SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { AlertGate } from './alert-gate';
import { activityOf, alertOf, planEvents, RefreshPlan, SYNC_ALERTS } from './event-plan';
import { SyncthingEventStreams } from './event-streams';
import { Loop } from '../../loop';
import { Throttle } from '../../throttle';
import { WireGate } from '../wire-gate';
import { JsonApiRefusedError, reasonOf } from '../json-api';
import type { SyncthingRest } from './rest-client';
import { FOLDER_SUMMARY_EVENT, type SyncthingEvent } from './rest-schemas';
import { buildSnapshot } from './snapshot';
import { emptySyncData, SyncDataLoader } from './sync-data';
import { TransferRates } from './transfer-rates';
import { background } from '@smarteverything/logging';

const BATCH_MS = 100;
const RATE_MS = 1_000;
const WIRE_QUIET_MS = 10_000;
const ACTIVITY_KEPT = 200;

export interface MonitorOptions {
  readonly rest: SyncthingRest;
  readonly overdueHours: number;
  readonly log: Logger;
  readonly record: (snapshot: SyncthingSnapshot) => void;
  readonly publish: (snapshot: SyncthingSnapshot) => void;
  readonly publishActivity: (activity: readonly SyncActivity[]) => void;
  readonly emit: (event: PluginEvent) => void;
}

export class SyncthingMonitor {
  readonly #data = emptySyncData();
  readonly #loader: SyncDataLoader;
  readonly #rates = new TransferRates();
  readonly #streams: SyncthingEventStreams;
  readonly #alerts: AlertGate;
  #connection: SyncthingSnapshot['connection'] = { state: 'connecting' };
  #pending = new RefreshPlan();
  readonly #batch = new Throttle(() => {
    background(this.#flush(), 'sync_monitor.flush_failed');
  }, BATCH_MS);
  readonly #rateLoop = new Loop(
    () => this.#sampleRates(),
    () => RATE_MS,
  );
  #failedRates = 0;
  #watched = false;
  readonly #wire = new WireGate(WIRE_QUIET_MS);
  #overdueTimer: NodeJS.Timeout | null = null;
  #overdue = new Set<string>();
  #activity: SyncActivity[] = [];
  #latest: SyncthingSnapshot;

  constructor(private readonly options: MonitorOptions) {
    this.#loader = new SyncDataLoader(options.rest, this.#data);
    this.#alerts = new AlertGate(options.emit);
    this.#streams = new SyncthingEventStreams(options.rest, {
      onEvents: (events, bootstrap): void => {
        this.#onEvents(events, bootstrap);
      },
      onGap: (): void => {
        this.#queue(Object.assign(new RefreshPlan(), { full: true }));
      },
      onUp: (): void => {
        this.#connection = { state: 'online' };
        this.#queue(Object.assign(new RefreshPlan(), { full: true }));
      },
      onDown: (error): void => {
        this.#onDown(error);
      },
    });
    this.#latest = this.#build();
  }

  get latest(): SyncthingSnapshot {
    return this.#latest;
  }

  get activity(): readonly SyncActivity[] {
    return this.#activity;
  }

  start(): void {
    this.options.record(this.#latest);
    this.options.publish(this.#latest);
    this.#streams.start();
    this.#rateLoop.runNow();
  }

  stop(): void {
    this.#streams.stop();
    this.#rateLoop.stop();
    this.#batch.cancel();
    if (this.#overdueTimer !== null) {
      clearTimeout(this.#overdueTimer);
    }
  }

  setWatched(watched: boolean): void {
    this.#watched = watched;
    if (watched) {
      this.#publish();
    }
  }

  refreshSoon(): void {
    this.#queue(Object.assign(new RefreshPlan(), { full: true }));
  }

  #onEvents(events: readonly SyncthingEvent[], bootstrap: boolean): void {
    this.#record(events);
    if (bootstrap) {
      return;
    }
    const now = Date.now();
    events.forEach((event) => {
      this.#applySummary(event);
      const alert = alertOf(event);
      if (alert !== null) {
        this.#alerts.offer(alert, now);
      }
    });
    this.#queue(planEvents(events));
  }

  #applySummary(event: SyncthingEvent): void {
    if (event.type !== 'FolderSummary') {
      return;
    }
    const parsed = FOLDER_SUMMARY_EVENT.safeParse(event.data);
    if (parsed.success) {
      this.#data.summaries.set(parsed.data.folder, parsed.data.summary);
    }
  }

  #record(events: readonly SyncthingEvent[]): void {
    const added = events.flatMap((event) => activityOf(event) ?? []).reverse();
    if (added.length === 0) {
      return;
    }
    const known = new Set(this.#activity.map((entry) => `${String(entry.id)}|${entry.kind}`));
    const fresh = added.filter((entry) => !known.has(`${String(entry.id)}|${entry.kind}`));
    this.#activity = [...fresh, ...this.#activity]
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, ACTIVITY_KEPT);
    this.options.publishActivity(this.#activity);
  }

  #queue(plan: RefreshPlan): void {
    this.#pending.merge(plan);
    if (!this.#pending.empty) {
      this.#batch.trigger();
    }
  }

  async #flush(): Promise<void> {
    const plan = this.#pending;
    this.#pending = new RefreshPlan();
    try {
      await this.#loader.apply(plan);
      this.#publish();
    } catch (error) {
      this.options.log.warn('syncthing.refresh_failed', { reason: reasonOf(error) });
      this.#queue(plan);
    }
  }

  async #sampleRates(): Promise<void> {
    try {
      const connections = await this.#loader.connections();
      this.#rates.sample(connections, Date.now());
      this.#ratesRecovered();
      this.#latest = this.#build();
      this.options.record(this.#latest);
      if (this.#wire.due(this.#watched)) {
        this.options.publish(this.#latest);
      }
    } catch (error) {
      if (this.#failedRates === 0) {
        this.options.log.warn('syncthing.rates_failed', { reason: reasonOf(error) });
      }
      this.#failedRates += 1;
      this.#rates.reset();
    }
  }

  #ratesRecovered(): void {
    if (this.#failedRates > 0) {
      this.options.log.info('syncthing.rates_recovered', { failedSamples: this.#failedRates });
      this.#failedRates = 0;
    }
  }

  #onDown(error: unknown): void {
    const reason = reasonOf(error);
    const since =
      this.#connection.state === 'unreachable' ? this.#connection.since : new Date().toISOString();
    if (this.#connection.state === 'online' || this.#connection.state === 'connecting') {
      this.options.log.warn('syncthing.unreachable', { reason });
    }
    this.#connection =
      error instanceof JsonApiRefusedError
        ? { state: 'key_rejected' }
        : { state: 'unreachable', reason, since };
    this.#publish();
  }

  #build(): SyncthingSnapshot {
    return buildSnapshot({
      data: this.#data,
      rates: this.#rates,
      ratesLive: this.#rates.ready,
      connection: this.#connection,
      overdueHours: this.options.overdueHours,
      now: new Date(),
    });
  }

  #publish(): void {
    this.#latest = this.#build();
    this.options.record(this.#latest);
    this.options.publish(this.#latest);
    this.#watchOverdue();
  }

  #watchOverdue(): void {
    const now = Date.now();
    const overdue = new Set(
      this.#latest.peers.filter((peer) => peer.overdue).map((peer) => peer.id),
    );
    this.#latest.peers
      .filter((peer) => peer.overdue && !this.#overdue.has(peer.id))
      .forEach((peer) => {
        this.#alerts.offer(
          {
            kind: SYNC_ALERTS.deviceOverdue,
            subject: peer.name,
            data: { device_id: peer.id, last_seen: peer.lastSeen },
          },
          now,
        );
      });
    this.#overdue = overdue;
    this.#scheduleOverdueCheck(now);
  }

  #scheduleOverdueCheck(now: number): void {
    if (this.#overdueTimer !== null) {
      clearTimeout(this.#overdueTimer);
      this.#overdueTimer = null;
    }
    const hours = this.options.overdueHours;
    const due = this.#latest.peers.flatMap((peer) =>
      peer.connected || peer.paused || peer.overdue || peer.lastSeen === null || hours <= 0
        ? []
        : [new Date(peer.lastSeen).getTime() + hours * 3_600_000 - now],
    );
    if (due.length > 0) {
      this.#overdueTimer = setTimeout(
        () => {
          this.#overdueTimer = null;
          this.#publish();
        },
        Math.min(Math.max(0, Math.min(...due)) + 1_000, 2_147_000_000),
      );
    }
  }
}
