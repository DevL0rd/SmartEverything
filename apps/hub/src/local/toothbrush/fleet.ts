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
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { RuntimePort } from './brand';
import { brandOfEntry } from './brands';
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

  constructor(
    readonly deviceId: string,
    public entry: LocalDeviceEntry,
    readonly runtime: BrushRuntime,
    readonly link: LinkState,
  ) {}

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
    this.entry = entry;
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
  readonly store: Store;
  readonly log: Logger;
}

export class Fleet {
  private readonly states = new Map<string, DeviceState>();

  constructor(private readonly options: FleetOptions) {}

  of(device: DeviceRow): DeviceState {
    const known = this.states.get(device.id);
    if (known !== undefined) {
      return known;
    }
    const entry = this.options.store.localDevices.byExternalId(device.external_id);
    const runtime = new BrushRuntime(brandOfEntry(entry), entry, this.portOf(device.id, entry));
    const state = new DeviceState(device.id, entry, runtime, {
      phase: phaseOf(device),
      rssi: null,
      detail: textOf(device.details['linkDetail']),
      heardAt: textOf(device.details['lastHeardAt']),
    });
    this.states.set(device.id, state);
    state.faultBaseline = baselineOf(device);
    return state;
  }

  known(deviceId: string): DeviceState | undefined {
    return this.states.get(deviceId);
  }

  private portOf(deviceId: string, initial: LocalDeviceEntry): RuntimePort {
    const { localDevices, brushingSessions } = this.options.store;
    const entry = (): LocalDeviceEntry =>
      this.states.get(deviceId)?.entry ?? localDevices.byExternalId(initial.externalId);
    return {
      entry,
      persist: (change): void => {
        localDevices.updateConfig(initial.externalId, change(entry().config));
        this.states.get(deviceId)?.useEntry(localDevices.byExternalId(initial.externalId));
      },
      known: (handleSessionId): boolean =>
        brushingSessions.findByHandleId(deviceId, handleSessionId) !== undefined,
    };
  }

  refresh(device: DeviceRow): DeviceState {
    this.states.delete(device.id);
    return this.of(device);
  }

  drop(deviceId: string): void {
    this.states.delete(deviceId);
  }

  all(): readonly DeviceState[] {
    return [...this.states.values()];
  }
}
