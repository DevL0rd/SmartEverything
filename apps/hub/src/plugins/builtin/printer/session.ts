import type { CapabilityKey, PrinterActiveJob } from '@smarteverything/domain';
import type {
  PrinterDescription,
  PrinterJob,
  PrinterStatus,
  SubscriptionGrant,
} from '@smarteverything/ipp';
import { Loop } from '../../loop';
import type { Unsubscribe } from '../contract';
import { DeviceMirror } from '../device-mirror';
import { parseAddress } from './address';
import { nextDelayMs } from './cadence';
import type { PrinterClient } from './client';
import { composeModel } from './compose';
import { SAMPLED_PREFIXES, describePrinter, externalIdOf, readingsOf } from './device';
import { PrinterEmitter } from './emitter';
import { JobObserver, type ObservedQueue } from './job-observer';
import type { PrinterLedger } from './ledger';
import { Liveness, type LivenessPorts } from './liveness';
import type { PrinterModel } from './model';
import type { Notification } from './notification';
import { PushChannel } from './push';
import { RateGuard } from './rate-guard';
import { Reactions } from './reactions';
import { PRINTERS, type PrinterRecord } from './records';
import {
  SNAPSHOTS,
  openLedger,
  passwordSecretName,
  reasonOf,
  spanState,
  type Described,
  type SessionHost,
} from './session-host';

const RECHECK_MIN_MS = 1_000;
const PROGRESS_STEP = 5;
const STATE_WRITE_MS = 60_000;
const SUBSCRIBE_OPERATIONS = [0x16, 0x1c] as const;
const FIXED_SAMPLED: readonly CapabilityKey[] = [
  'raw:printer.pages_total',
  'raw:printer.pages_color',
  'raw:printer.pages_mono',
  'raw:printer.days_left',
];

export class PrinterSession {
  readonly ledger: PrinterLedger;
  readonly observer: JobObserver;
  readonly mirror: DeviceMirror<PrinterModel>;
  readonly #host: SessionHost;
  readonly #sampled = new Set<CapabilityKey>(FIXED_SAMPLED);
  readonly #abort = new AbortController();
  readonly #liveness: Liveness;
  readonly #reactions: Reactions;
  readonly #loop: Loop;
  readonly #push: PushChannel;
  #record: PrinterRecord;
  #client: PrinterClient;
  #description: PrinterDescription;
  #status: PrinterStatus;
  #queue: ObservedQueue = { active: null, progress: null, waiting: 0 };
  #model: PrinterModel | null = null;
  #viewed = false;
  #unwatch: Unsubscribe | null = null;
  #lastRead: number | null = null;
  #recheck: NodeJS.Timeout | null = null;
  #progress: number | null = null;

  constructor(host: SessionHost, record: PrinterRecord, described: Described, online: boolean) {
    this.#host = host;
    this.#record = record;
    this.#description = described.description;
    this.#status = described.description.status;
    this.ledger = openLedger(host, record.uuid);
    const ports = this.#ports();
    this.#client = this.#openClient();
    this.#liveness = new Liveness(ports, online);
    this.#reactions = new Reactions({
      ...ports,
      log: host.log,
      describe: (): Promise<void> => this.describeNow(),
      backfill: (): Promise<number> => this.observer.backfill(),
    });
    this.observer = this.#watcher();
    this.#loop = new Loop(
      (): Promise<void> => this.#cycle(),
      (): number | null => this.#delay(),
    );
    this.#push = this.#channel();
    this.mirror = new DeviceMirror<PrinterModel>({
      externalId: externalIdOf(record.uuid),
      describe: describePrinter,
      readings: readingsOf,
      observedAt: (model): string => model.observedAt,
      sampled: { keys: this.#sampled, metrics: host.metrics, stateEveryMs: STATE_WRITE_MS },
    });
  }

  #ports(): LivenessPorts {
    const emitter = new PrinterEmitter({
      guard: new RateGuard(this.#host.log),
      ledger: this.ledger,
      send: this.#host.send,
      now: this.#host.clock.now,
      printer: (): { readonly id: string; readonly name: string } => ({
        id: this.#record.uuid,
        name: this.name,
      }),
    });
    return {
      record: (): PrinterRecord => this.#record,
      update: (patch: Partial<PrinterRecord>): void => {
        this.update(patch);
      },
      name: (): string => this.name,
      emitter,
      ledger: this.ledger,
    };
  }

  #watcher(): JobObserver {
    return new JobObserver({
      client: {
        jobs: (query): Promise<readonly PrinterJob[]> => this.#client.jobs(query),
        job: (id): Promise<PrinterJob | null> => this.#client.job(id),
      },
      ledger: this.ledger,
      epoch: (): number => this.#record.epoch,
      upTime: (): number | null => this.#status.upTime,
      now: this.#host.clock.now,
      notify: (notice): void => {
        this.#reactions.jobNotice(notice);
      },
    });
  }

  #channel(): PushChannel {
    return new PushChannel({
      client: {
        subscribe: (): Promise<SubscriptionGrant | null> => this.#client.subscribe(),
        renew: (id): Promise<void> => this.#client.renew(id),
        unsubscribe: (id): Promise<void> => this.#client.unsubscribe(id),
        notifications: (id, after, signal): Promise<Notification> =>
          this.#client.notifications(id, after, signal),
      },
      saved: (): PrinterRecord['subscription'] => this.#record.subscription,
      save: (subscription): void => {
        this.update({ subscription });
      },
      changed: (): void => {
        this.#loop.runNow();
      },
      lapsed: (): void => {
        this.#loop.runNow();
      },
      failed: (cause): void => {
        this.#host.log.warn('printer.push_failed', { reason: reasonOf(cause) });
      },
      signal: this.#abort.signal,
      leaseSeconds: (): number => this.#record.settings.leaseSeconds,
    });
  }

  get record(): PrinterRecord {
    return this.#record;
  }

  get name(): string {
    return this.#record.customName ?? this.#record.name;
  }

  get externalId(): string {
    return externalIdOf(this.#record.uuid);
  }

  get client(): PrinterClient {
    return this.#client;
  }

  get model(): PrinterModel | null {
    return this.#model;
  }

  get description(): PrinterDescription {
    return this.#description;
  }

  get viewed(): boolean {
    return this.#viewed;
  }

  get pushing(): boolean {
    return this.#push.active;
  }

  get online(): boolean {
    return this.#liveness.presence.online;
  }

  #openClient(): PrinterClient {
    const user = this.#record.user;
    const password = this.#host.secrets.get(passwordSecretName(this.#record.uuid));
    return this.#host.openClient({
      address: parseAddress(this.#record.uri),
      pin: this.#record.pin,
      credentials: user === null || password === null ? null : { user, password },
    });
  }

  reopenClient(): void {
    this.#client = this.#openClient();
  }

  update(patch: Partial<PrinterRecord>): PrinterRecord {
    this.#record = { ...this.#record, ...patch };
    this.#host.records(PRINTERS).put(this.#record.uuid, this.#record);
    return this.#record;
  }

  start(): void {
    this.#unwatch = this.#host.viewers.watchDevice(this.externalId, (viewed) => {
      this.#viewed = viewed;
      this.#loop.runNow();
    });
    this.#publish(this.#status, this.#host.clock.now());
    this.#loop.start();
    this.#loop.runNow();
    this.#startPush();
  }

  stop(): void {
    this.#abort.abort();
    this.#loop.stop();
    this.#push.stop();
    this.#unwatch?.();
    if (this.#recheck !== null) clearTimeout(this.#recheck);
    this.mirror.detach();
  }

  refresh(): void {
    this.#loop.runNow();
  }

  poll(): Promise<void> {
    return this.#cycle();
  }

  goodbye(): void {
    this.#liveness.presence.goodbye();
    this.#loop.runNow();
  }

  #startPush(): void {
    const operations = this.#description.capabilities.operations;
    const offered = SUBSCRIBE_OPERATIONS.every((operation) => operations.includes(operation));
    if (!offered || this.#record.disabledOps.includes(SUBSCRIBE_OPERATIONS[0])) return;
    this.#push.start().catch((cause: unknown) => {
      this.#host.log.warn('printer.push_start_failed', { reason: reasonOf(cause) });
    });
  }

  #active(): boolean {
    return (
      this.#status.state === 'processing' ||
      (this.#status.queuedJobs ?? 0) > 0 ||
      this.observer.tracking
    );
  }

  #delay(): number | null {
    return nextDelayMs({
      settings: this.#record.settings,
      viewed: this.#viewed,
      active: this.#active(),
      power: this.#model?.power ?? 'awake',
      failures: this.#liveness.presence.failures,
      busyStreak: this.#liveness.busyStreak,
      authBlocked: this.#liveness.authBlocked,
    });
  }

  async #cycle(): Promise<void> {
    const now = this.#host.clock.now();
    try {
      const status = await this.#client.pollStatus();
      if (status !== null) await this.#succeeded(status, now);
    } catch (cause) {
      this.#failed(cause, now);
    }
  }

  async #succeeded(status: PrinterStatus, now: Date): Promise<void> {
    const flip = this.#liveness.succeeded(now);
    this.#account(now, true);
    const restarted = this.#reactions.restarted(status, now);
    this.#reactions.counters(status, restarted, now);
    this.#status = status;
    if (flip === 'online') await this.#reactions.reconnected(now);
    await this.#reactions.configChange(status, now);
    this.#scheduleRecheck(this.#reactions.observe(this.#compose(status, now), status, now));
    if (this.#active()) await this.#observeJobs();
    else this.#queue = { active: null, progress: null, waiting: 0 };
    this.update({
      lastSeen: now.toISOString(),
      lastUpTime: status.upTime,
      configChange: status.configChangeTime,
      markerChange: status.markerChangeTime,
    });
    this.#publish(status, now);
  }

  #account(now: Date, online: boolean): void {
    const last = this.#lastRead;
    this.#lastRead = now.getTime();
    if (last === null) return;
    const seconds = (now.getTime() - last) / 1000;
    this.ledger.addSeconds(now, online ? 'online' : 'offline', seconds);
    if (online && this.#status.state === 'processing')
      this.ledger.addSeconds(now, 'active', seconds);
  }

  async describeNow(): Promise<void> {
    const described = await this.#client.describe();
    this.#description = described.description;
    this.#host.records(SNAPSHOTS).put(this.#record.uuid, { raw: described.raw });
    this.update({ disabledOps: [] });
  }

  #scheduleRecheck(ms: number | null): void {
    if (this.#recheck !== null) clearTimeout(this.#recheck);
    this.#recheck = null;
    if (ms === null) return;
    this.#recheck = setTimeout(
      () => {
        this.#loop.runNow();
      },
      Math.max(ms, RECHECK_MIN_MS),
    );
    this.#recheck.unref();
  }

  async #observeJobs(): Promise<void> {
    try {
      this.#queue = await this.observer.observe();
    } catch (cause) {
      this.#host.log.warn('printer.jobs_failed', { reason: reasonOf(cause) });
    }
  }

  #failed(cause: unknown, now: Date): void {
    this.#account(now, false);
    const failure = this.#liveness.failed(cause, now);
    if (failure.busy) return;
    this.#host.log.debug('printer.read_failed', () => ({
      reason: reasonOf(cause),
      failures: this.#liveness.presence.failures,
    }));
    this.#publish(this.#status, now);
  }

  #compose(status: PrinterStatus, now: Date): PrinterModel {
    return composeModel({
      record: this.#record,
      description: this.#description,
      status,
      ledger: this.ledger,
      online: this.online,
      now,
      progress: this.#progress,
      activeJob: this.#queue.active,
      previous: this.#model,
    });
  }

  #quantized(progress: number | null, active: PrinterActiveJob | null): number | null {
    if (progress === null || active === null) return null;
    const last = this.#progress;
    const moved = last === null || Math.abs(progress - last) >= PROGRESS_STEP || progress === 100;
    return moved ? progress : last;
  }

  #publish(status: PrinterStatus, now: Date): void {
    this.#progress = this.#quantized(this.#queue.progress, this.#queue.active);
    const model = this.#compose(status, now);
    this.update({ slotKeys: model.supplies.map((supply) => supply.key) });
    this.#model = model;
    this.#sampled.clear();
    for (const key of FIXED_SAMPLED) this.#sampled.add(key);
    for (const key of readingsOf(model).keys()) {
      if (SAMPLED_PREFIXES.some((prefix) => key.startsWith(prefix))) this.#sampled.add(key);
    }
    this.ledger.transition(spanState(model), now);
    this.mirror.update(model);
    this.#host.changed();
  }
}
