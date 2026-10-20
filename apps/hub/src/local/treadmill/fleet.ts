import {
  PAD_PREFERENCES,
  type BeltLinkPhase,
  type DeviceRow,
  type JsonValue,
  type TreadmillLinkReport,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { entryConfigOf, identityOfDevice } from './config';
import { SessionKeeper } from './keeper';
import { TreadmillRuntime, type Snapshot } from './runtime';

const RAW_LOG_FRAMES = 500;

const CADENCE_WINDOW_SECONDS = 10;

const CADENCE_MIN_SECONDS = 3;

export interface PadRecordView {
  readonly at: string;
  readonly activeSeconds: number;
  readonly distanceM: number;
  readonly steps: number;
  readonly sessionId: string | null;
}

export interface RawFrame {
  readonly at: string;
  readonly characteristic: string;
  readonly hex: string;
}

export interface LinkState {
  phase: BeltLinkPhase;
  rssi: number | null;
  reconnects: number;
  detail: string | null;
  heardAt: string | null;
}

export interface DeviceStateParts {
  readonly deviceId: string;
  readonly entry: LocalDeviceEntry;
  readonly keeper: SessionKeeper;
  readonly runtime: TreadmillRuntime;
  readonly link: LinkState;
}

interface Mark {
  readonly timeS: number;
  readonly steps: number;
}

function cadenceBetween(first: Mark | undefined, last: Mark): number | null {
  if (first === undefined || last.timeS - first.timeS < CADENCE_MIN_SECONDS) {
    return null;
  }
  return ((last.steps - first.steps) / (last.timeS - first.timeS)) * 60;
}

export class DeviceState {
  readonly deviceId: string;
  entry: LocalDeviceEntry;
  readonly runtime: TreadmillRuntime;
  readonly keeper: SessionKeeper;
  readonly link: LinkState;
  readonly rawLog: RawFrame[] = [];
  private rawEnabled = false;
  lastError: string | null = null;
  latencyMs: number | null = null;
  private goalReached = false;
  private sampledAt = 0;
  padRecordsRemaining: number | null = null;
  padRecords: PadRecordView[] = [];
  private recordWanted = false;
  cadence: number | null = null;
  readonly sent = new Map<string, JsonValue>();
  private readonly cadenceWindow: { readonly timeS: number; readonly steps: number }[] = [];
  readonly eventTimes: number[] = [];
  private readonly waiters = new Set<() => void>();

  constructor(parts: DeviceStateParts) {
    this.deviceId = parts.deviceId;
    this.entry = parts.entry;
    this.keeper = parts.keeper;
    this.runtime = parts.runtime;
    this.link = parts.link;
  }

  useEntry(entry: LocalDeviceEntry): void {
    this.entry = entry;
  }

  setLink(report: TreadmillLinkReport, at: string): void {
    this.link.phase = report.phase;
    this.link.rssi = report.rssi;
    this.link.reconnects = report.reconnects;
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

  recordCommand(latencyMs: number, error: string | null): void {
    this.latencyMs = latencyMs;
    this.lastError = error;
  }

  wishRecord(): void {
    this.recordWanted = true;
  }

  takeRecordWish(): boolean {
    const wanted = this.recordWanted;
    this.recordWanted = false;
    return wanted;
  }

  setRecords(records: PadRecordView[], remaining: number): void {
    this.padRecords = records;
    this.padRecordsRemaining = remaining;
  }

  armGoal(): void {
    this.goalReached = false;
  }

  takeGoal(): boolean {
    const first = !this.goalReached;
    this.goalReached = true;
    return first;
  }

  updateCadence(snapshot: Snapshot): number | null {
    const { timeS, steps } = snapshot.live;
    if (timeS === undefined || steps === undefined || snapshot.state !== 'running') {
      this.cadenceWindow.length = 0;
      this.cadence = null;
      return null;
    }
    this.cadenceWindow.push({ timeS, steps });
    while (
      this.cadenceWindow.length > 1 &&
      this.cadenceWindow[0] !== undefined &&
      timeS - this.cadenceWindow[0].timeS > CADENCE_WINDOW_SECONDS
    ) {
      this.cadenceWindow.shift();
    }
    this.cadence = cadenceBetween(this.cadenceWindow[0], { timeS, steps }) ?? this.cadence;
    return this.cadence;
  }

  sampleDue(nowMs: number, everyMs: number): boolean {
    if (nowMs - this.sampledAt < everyMs) {
      return false;
    }
    this.sampledAt = nowMs;
    return true;
  }

  until(done: () => boolean, timeoutMs: number): Promise<boolean> {
    if (done()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const check = (): void => {
        if (done()) {
          clearTimeout(timer);
          this.waiters.delete(check);
          resolve(true);
        }
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        resolve(false);
      }, timeoutMs);
      this.waiters.add(check);
    });
  }

  whenRunning(timeoutMs: number): Promise<boolean> {
    return this.until(() => this.runtime.machine.state === 'running', timeoutMs);
  }

  notifyWaiters(): void {
    for (const check of [...this.waiters]) {
      check();
    }
  }
}

export interface FleetOptions {
  readonly store: Store;
  readonly log: Logger;
}

function linkOf(device: DeviceRow): LinkState {
  const phase = device.details['linkPhase'];
  const rssi = device.details['linkRssi'];
  const reconnects = device.details['linkReconnects'];
  const detail = device.details['linkDetail'];
  const heardAt = device.details['lastHeardAt'];
  return {
    phase: typeof phase === 'string' && isPhase(phase) ? phase : 'not_linked',
    rssi: typeof rssi === 'number' ? rssi : null,
    reconnects: typeof reconnects === 'number' ? reconnects : 0,
    detail: typeof detail === 'string' ? detail : null,
    heardAt: typeof heardAt === 'string' ? heardAt : null,
  };
}

function isPhase(value: string): value is BeltLinkPhase {
  return ['not_linked', 'searching', 'connecting', 'linked', 'busy', 'lost'].includes(value);
}

export class Fleet {
  private readonly states = new Map<string, DeviceState>();

  constructor(private readonly options: FleetOptions) {}

  of(device: DeviceRow): DeviceState {
    const known = this.states.get(device.id);
    if (known !== undefined) {
      return known;
    }
    const { store, log } = this.options;
    const entry = store.localDevices.byExternalId(device.external_id);
    const config = entryConfigOf(entry);
    const pad = PAD_PREFERENCES.safeParse(device.details['pad']);
    const runtime = new TreadmillRuntime({
      family: config.family,
      identity: identityOfDevice(config.gatt, device.details['identity']),
      pad: pad.success ? pad.data : {},
    });
    const keeper = new SessionKeeper({ store, deviceId: device.id, log });
    const created = new DeviceState({
      deviceId: device.id,
      entry,
      keeper,
      runtime,
      link: linkOf(device),
    });
    this.states.set(device.id, created);
    return created;
  }

  drop(deviceId: string): void {
    this.states.delete(deviceId);
  }

  all(): readonly DeviceState[] {
    return [...this.states.values()];
  }
}
