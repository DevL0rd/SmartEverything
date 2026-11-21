import {
  BRUSH_LINK_PHASES,
  type BrushLinkPhase,
  type BrushLinkReport,
  type BrushView,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoredHead } from '../../store/repositories/brushing-sessions';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { Unsubscribe } from '../../store/feed';
import { FleetRoster } from '../fleet-roster';
import type { RuntimePort } from './brand';
import { brandOfEntry, isBrushEntry } from './brands';
import type { BrushRecords } from './brush-units';
import { Memo } from './memo';
import { BrushRuntime } from './runtime';

const RAW_LOG_FRAMES = 300;

export interface RawFrame {
  readonly at: string;
  readonly characteristic: string;
  readonly hex: string;
}

export interface LinkState {
  phase: BrushLinkPhase;
  rssi: number | null;
  detail: string | null;
  heardAt: string | null;
}

type StateView = Extract<BrushView, { readonly view: 'state' }>;

export type StateFigures = Pick<StateView, 'today' | 'streak' | 'score' | 'lastSession'>;

export type StatsFigures = Pick<Extract<BrushView, { readonly view: 'stats' }>, 'stats' | 'today'>;

function phaseOf(device: DeviceRow): BrushLinkPhase {
  const phase = device.details['linkPhase'];
  return BRUSH_LINK_PHASES.find((candidate) => candidate === phase) ?? 'asleep';
}

function textOf(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

const BASELINE = z.array(z.number().nullable());

function baselineOf(device: DeviceRow): readonly (number | null)[] | null {
  const parsed = BASELINE.safeParse(device.details['faultBaseline']);
  return parsed.success ? parsed.data : null;
}

class BrushStateMissingError extends Error {
  override readonly name = 'BrushStateMissingError';

  constructor(readonly deviceId: string) {
    super(`The toothbrush ${deviceId} is not loaded on the hub.`);
  }
}

export interface DeviceStateParts {
  readonly deviceId: string;
  readonly roster: FleetRoster;
  readonly externalId: string;
  readonly runtime: BrushRuntime;
  readonly link: LinkState;
  readonly records: BrushRecords;
}

export class DeviceState {
  readonly rawLog: RawFrame[] = [];
  readonly sent = new Map<string, JsonValue>();
  readonly eventTimes: number[] = [];
  readonly notifiedHeadLevels = new Set<string>();
  readonly unavailable = new Set<number>();
  readonly figures = new Memo<StateFigures>();
  readonly statistics = new Memo<StatsFigures>();
  fetching = new Set<number>();
  fetchStartedAt = 0;
  faultBaseline: readonly (number | null)[] | null = null;
  transferDropped = false;
  private startedAtMs: number | null = null;
  lastError: string | null = null;
  latencyMs: number | null = null;
  private rawEnabled = false;
  private readonly handleIds: Set<number>;
  heads: readonly StoredHead[];
  private pending: Promise<void>[] = [];
  private readonly failures: Error[] = [];

  readonly deviceId: string;
  readonly runtime: BrushRuntime;
  readonly link: LinkState;
  private readonly roster: FleetRoster;
  private readonly externalId: string;

  constructor(parts: DeviceStateParts) {
    this.deviceId = parts.deviceId;
    this.roster = parts.roster;
    this.externalId = parts.externalId;
    this.runtime = parts.runtime;
    this.link = parts.link;
    this.handleIds = new Set(parts.records.handleIds);
    this.heads = parts.records.heads;
  }

  useHeads(heads: readonly StoredHead[]): void {
    this.heads = heads;
  }

  get entry(): LocalDeviceEntry {
    return this.roster.entryOf(this.externalId);
  }

  storedHandleIds(): ReadonlySet<number> {
    return this.handleIds;
  }

  knows(handleSessionId: number): boolean {
    return this.handleIds.has(handleSessionId);
  }

  stored(handleSessionId: number | null): void {
    if (handleSessionId !== null) {
      this.handleIds.add(handleSessionId);
    }
    this.sessionsChanged();
  }

  forgot(handleSessionId: number | null): void {
    if (handleSessionId !== null) {
      this.handleIds.delete(handleSessionId);
    }
    this.sessionsChanged();
  }

  track(write: Promise<unknown>): void {
    this.pending.push(
      write.then(
        () => undefined,
        (cause: unknown) => {
          this.failures.push(cause instanceof Error ? cause : new Error(String(cause)));
        },
      ),
    );
  }

  async settled(): Promise<void> {
    while (this.pending.length > 0) {
      const writes = this.pending;
      this.pending = [];
      await Promise.all(writes);
    }
    const [failure] = this.failures.splice(0);
    if (failure !== undefined) {
      throw failure;
    }
  }

  setFaultBaseline(baseline: readonly (number | null)[]): void {
    this.faultBaseline = baseline;
  }

  noteFetch(nowMs: number): void {
    this.fetchStartedAt = nowMs;
  }

  get linkStartedAtMs(): number | null {
    return this.startedAtMs;
  }

  markLinkStart(atMs: number): void {
    this.startedAtMs = atMs;
  }

  sessionsChanged(): void {
    this.figures.clear();
    this.statistics.clear();
  }

  linkDropped(): void {
    this.transferDropped = this.runtime.transferring || this.transferDropped;
    this.fetching.clear();
  }

  linkRestored(): void {
    this.transferDropped = false;
  }

  useEntry(entry: LocalDeviceEntry): void {
    this.roster.use(entry);
  }

  setLink(report: BrushLinkReport, at: string): void {
    this.link.phase = report.phase;
    this.link.rssi = report.rssi;
    this.link.detail = report.detail;
    this.link.heardAt = at;
  }

  get rawLogging(): boolean {
    return this.rawEnabled;
  }

  setRawLog(enabled: boolean): void {
    this.rawEnabled = enabled;
    if (!enabled) {
      this.rawLog.length = 0;
    }
  }

  note(frames: readonly RawFrame[]): void {
    if (!this.rawEnabled) {
      return;
    }
    this.rawLog.push(...frames);
    if (this.rawLog.length > RAW_LOG_FRAMES) {
      this.rawLog.splice(0, this.rawLog.length - RAW_LOG_FRAMES);
    }
  }
}

export interface FleetOptions {
  readonly store: Pick<Store, 'host' | 'feed'>;
  readonly log: Logger;
}

export class Fleet {
  private readonly states = new Map<string, DeviceState>();
  private readonly loading = new Map<string, Promise<DeviceState>>();
  readonly roster: FleetRoster;

  constructor(private readonly options: FleetOptions) {
    this.roster = new FleetRoster({
      store: options.store,
      accepts: isBrushEntry,
      name: 'toothbrush',
    });
  }

  async start(): Promise<Unsubscribe> {
    const unsubscribe = this.roster.follow({
      added: async (device): Promise<void> => {
        await this.ensure(device);
      },
      removed: (deviceId): void => {
        this.drop(deviceId);
      },
    });
    await this.roster.load();
    await Promise.all(this.roster.members().map(({ device }) => this.ensure(device)));
    return unsubscribe;
  }

  of(device: Pick<DeviceRow, 'id'>): DeviceState {
    const known = this.states.get(device.id);
    if (known === undefined) {
      throw new BrushStateMissingError(device.id);
    }
    return known;
  }

  async ensure(device: DeviceRow): Promise<DeviceState> {
    const known = this.states.get(device.id);
    if (known !== undefined) {
      return known;
    }
    const loading = this.loading.get(device.id);
    if (loading !== undefined) {
      return loading;
    }
    const made = this.load(device).finally(() => {
      this.loading.delete(device.id);
    });
    this.loading.set(device.id, made);
    return made;
  }

  private async load(device: DeviceRow): Promise<DeviceState> {
    if (!this.roster.has(device.external_id)) {
      await this.roster.load();
    }
    const records = await this.options.store.host.read('brushRecords', device.id);
    const state = this.made(device, records);
    this.states.set(device.id, state);
    return state;
  }

  private made(device: DeviceRow, records: BrushRecords): DeviceState {
    const entry = this.roster.entryOf(device.external_id);
    const runtime = new BrushRuntime(brandOfEntry(entry), entry, this.portOf(device.id, entry));
    const state = new DeviceState({
      deviceId: device.id,
      roster: this.roster,
      externalId: entry.externalId,
      runtime,
      link: {
        phase: phaseOf(device),
        rssi: null,
        detail: textOf(device.details['linkDetail']),
        heardAt: textOf(device.details['lastHeardAt']),
      },
      records,
    });
    state.faultBaseline = baselineOf(device);
    return state;
  }

  known(deviceId: string): DeviceState | undefined {
    return this.states.get(deviceId);
  }

  device(deviceId: string): DeviceRow | undefined {
    return this.roster.device(deviceId);
  }

  private portOf(deviceId: string, initial: LocalDeviceEntry): RuntimePort {
    const { roster } = this;
    const { host } = this.options.store;
    return {
      entry: (): LocalDeviceEntry => roster.entryOf(initial.externalId),
      persist: (change): void => {
        const before = roster.entryOf(initial.externalId);
        const config = change(before.config);
        roster.use({ ...before, config });
        this.of({ id: deviceId }).track(
          host.write('localConfig', { externalId: initial.externalId, config }).then((saved) => {
            roster.use(saved);
          }),
        );
      },
      known: (handleSessionId): boolean => this.of({ id: deviceId }).knows(handleSessionId),
    };
  }

  refresh(device: DeviceRow): DeviceState {
    const before = this.of(device);
    const state = this.made(device, {
      handleIds: [...before.storedHandleIds()],
      heads: [...before.heads],
    });
    this.states.set(device.id, state);
    return state;
  }

  drop(deviceId: string): void {
    this.states.delete(deviceId);
  }

  all(): readonly DeviceState[] {
    return [...this.states.values()];
  }
}
