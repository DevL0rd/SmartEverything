import {
  ApiError,
  listeningKeyOf,
  listeningSignalState,
  sameListeningSignalState,
  type ListeningClaimRecord,
  type ListeningPowerMode,
  type ListeningRuntimeState,
  type ListeningSource,
  type ListeningSignalState,
  type ListeningSourceChange,
  type ListeningView,
  type RowChange,
  type TranscriptPauseReason,
  type WakeArbitrated,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ReachRules } from '../reach/reach-rules';
import type { Store } from '../store/store';
import { ListeningLevels } from './listening-levels';
import {
  NO_RUNTIME,
  cameraRows,
  deviceRows,
  walkieRows,
  type BareSource,
  type ListeningRowStore,
  type Runtime,
} from './listening-rows';
import { DeviceListeningSwitches } from './listening-switches';

const CLAIMS_KEPT = 5;

export interface ListeningStateChange {
  readonly source: ListeningSource;
  readonly state: ListeningSignalState;
  readonly previous: ListeningSignalState | null;
}

function signalStatesOf(sources: readonly ListeningSource[]): Map<string, ListeningSignalState> {
  return new Map(sources.map((source) => [source.key, listeningSignalState(source)]));
}

export interface ListeningViewer {
  readonly owner: boolean;
  readonly profileId: string;
}

export interface ListeningRegistryOptions {
  readonly store: ListeningRowStore & Pick<Store, 'cameras' | 'feed' | 'settingsKv'>;
  readonly rules: Pick<ReachRules, 'cameras' | 'wakeOff' | 'save' | 'onCamerasChanged'>;
  readonly cameraPauses: () => Promise<ReadonlyMap<string, TranscriptPauseReason>>;
  readonly announce: () => void;
  readonly connected: () => ReadonlySet<string>;
  readonly sendLevel: (clientId: string, sourceKey: string, dbfs: number) => void;
  readonly log: Logger;
}

function canSee(viewer: ListeningViewer, source: BareSource): boolean {
  if (viewer.owner) return true;
  return source.kind !== 'camera' && source.profileId === viewer.profileId;
}

const LISTENED_KINDS: ReadonlySet<string> = new Set(['camera', 'phone', 'computer']);

function listenedDeviceChanged(change: Extract<RowChange, { table: 'devices' }>): boolean {
  const { record, oldRecord } = change;
  const row = record ?? oldRecord;
  if (row === null || !LISTENED_KINDS.has(row.kind)) return false;
  if (record === null || oldRecord === null) return true;
  return (
    record.online !== oldRecord.online ||
    record.name !== oldRecord.name ||
    record.display_name !== oldRecord.display_name ||
    record.details['profileId'] !== oldRecord.details['profileId']
  );
}

export class ListeningRegistry {
  readonly levels: ListeningLevels;
  private readonly switches: DeviceListeningSwitches;
  private readonly runtimes = new Map<string, Runtime>();
  private readonly external = new Map<string, BareSource>();
  private readonly claims = new Map<string, ListeningClaimRecord[]>();
  private readonly changed = new Set<(key: string) => void>();
  private readonly stateListeners = new Set<(change: ListeningStateChange) => void>();
  private states = new Map<string, ListeningSignalState>();
  private last: WakeArbitrated | null = null;
  private signature = '';
  private unsubscribe: (() => void)[] = [];

  constructor(private readonly options: ListeningRegistryOptions) {
    this.switches = new DeviceListeningSwitches(options.store);
    this.levels = new ListeningLevels({
      connected: options.connected,
      send: options.sendLevel,
    });
  }

  start(): void {
    const sources = this.everything();
    this.signature = JSON.stringify(sources);
    this.states = signalStatesOf(sources);
    this.unsubscribe = [
      this.options.store.feed.subscribe((change) => {
        if (change.table === 'devices' && change.operation === 'DELETE') {
          if (change.oldRecord !== null) this.switches.forget(change.oldRecord.id);
        }
        if (this.concerns(change)) this.refresh();
      }),
      this.options.rules.onCamerasChanged(() => {
        this.refresh();
      }),
    ];
  }

  stop(): void {
    this.unsubscribe.forEach((stop) => {
      stop();
    });
    this.unsubscribe = [];
  }

  async view(viewer: ListeningViewer): Promise<ListeningView> {
    const sources = this.everything(await this.options.cameraPauses());
    return { sources: sources.filter((source) => canSee(viewer, source)), last: this.last };
  }

  async source(viewer: ListeningViewer, key: string): Promise<ListeningSource> {
    const found = this.everything(await this.options.cameraPauses()).find(
      (source) => source.key === key,
    );
    if (found === undefined || !canSee(viewer, found)) {
      throw new ApiError('not_found', `No listening source ${key}; listening_read lists them.`);
    }
    return found;
  }

  async change(
    viewer: ListeningViewer,
    key: string,
    change: ListeningSourceChange,
  ): Promise<ListeningSource> {
    const source = await this.source(viewer, key);
    if (!source.changeable) {
      throw new ApiError(
        'conflict',
        `${source.name} cannot be switched here; its own settings decide.`,
      );
    }
    if (change.power_mode !== undefined && source.kind !== 'phone') {
      throw new ApiError('conflict', `${source.name} has no power mode; only phones do.`);
    }
    if (source.kind === 'camera') this.changeCamera(viewer, source, change);
    else this.switches.save(source.key, change);
    this.refresh(source.key);
    return this.source(viewer, key);
  }

  wanted(deviceId: string): { readonly wake: boolean; readonly transcribe: boolean } {
    const { wake, transcribe } = this.switches.read(deviceId);
    return { wake, transcribe };
  }

  sensitivityOf(deviceId: string): WakeSensitivity {
    return this.switches.read(deviceId).sensitivity;
  }

  powerModeOf(deviceId: string): ListeningPowerMode {
    return this.switches.read(deviceId).powerMode;
  }

  onSwitched(listener: (key: string) => void): () => void {
    this.changed.add(listener);
    return (): void => {
      this.changed.delete(listener);
    };
  }

  onStateChanged(listener: (change: ListeningStateChange) => void): () => void {
    this.stateListeners.add(listener);
    return (): void => {
      this.stateListeners.delete(listener);
    };
  }

  setState(key: string, state: ListeningRuntimeState | null): void {
    this.setRuntime(key, { ...this.runtime(key), state });
  }

  setPaused(key: string, paused: TranscriptPauseReason | null): void {
    this.setRuntime(key, { ...this.runtime(key), paused });
  }

  setExternal(source: BareSource): void {
    this.external.set(source.key, source);
    this.refresh();
  }

  clearExternal(key: string): void {
    if (this.external.delete(key)) this.refresh();
  }

  contested(arbitrated: WakeArbitrated): void {
    this.last = arbitrated;
    arbitrated.claims.forEach((claim) => {
      const key = listeningKeyOf(claim.source, claim.key);
      const kept = [
        { at: arbitrated.at, snippetDbfs: claim.snippetDbfs, outcome: claim.outcome },
        ...(this.claims.get(key) ?? []),
      ].slice(0, CLAIMS_KEPT);
      this.claims.set(key, kept);
    });
    this.refresh();
  }

  private changeCamera(
    viewer: ListeningViewer,
    source: ListeningSource,
    change: ListeningSourceChange,
  ): void {
    if (change.wake !== undefined) this.switchCameraWake(viewer, source, change.wake);
    if (change.transcribe !== undefined || change.sensitivity !== undefined) {
      this.options.store.cameras.change(source.key, {
        ...(change.transcribe === undefined ? {} : { transcribe: change.transcribe }),
        ...(change.sensitivity === undefined ? {} : { wake_sensitivity: change.sensitivity }),
      });
    }
  }

  private switchCameraWake(viewer: ListeningViewer, source: ListeningSource, wake: boolean): void {
    const { rules } = this.options;
    if (wake && !rules.cameras().includes(source.key)) {
      throw new ApiError(
        'conflict',
        `${source.name} is not allowed to reach you; allow it under Reaching you first.`,
      );
    }
    const others = rules.wakeOff().filter((id) => id !== source.key);
    rules.save(viewer.profileId, { wakeOff: wake ? others : [...others, source.key] });
  }

  private everything(
    pauses: ReadonlyMap<string, TranscriptPauseReason> = new Map(),
  ): ListeningSource[] {
    const sources = {
      store: this.options.store,
      rules: this.options.rules,
      switches: this.switches,
      cameraPaused: (id: string): TranscriptPauseReason | null => pauses.get(id) ?? null,
      runtime: (key: string): Runtime => this.runtime(key),
    };
    return [
      ...cameraRows(sources),
      ...deviceRows(sources, 'phone'),
      ...deviceRows(sources, 'computer'),
      ...[...this.external.values()].map((source) => ({
        ...source,
        state: this.runtime(source.key).state ?? source.state,
      })),
      ...walkieRows(this.options.store, sources.runtime),
    ].map((source) => ({ ...source, claims: this.claims.get(source.key) ?? [] }));
  }

  private concerns(change: RowChange): boolean {
    if (change.table === 'device_state') {
      const id = change.record?.device_id;
      return id !== undefined && this.options.store.cameras.find(id) !== undefined;
    }
    if (change.table === 'devices') return listenedDeviceChanged(change);
    return change.table === 'cameras' || change.table === 'talk_channels';
  }

  private runtime(key: string): Runtime {
    return this.runtimes.get(key) ?? NO_RUNTIME;
  }

  private setRuntime(key: string, runtime: Runtime): void {
    this.runtimes.set(key, runtime);
    this.refresh();
  }

  private refresh(switched?: string): void {
    if (switched !== undefined) {
      this.changed.forEach((listener) => {
        listener(switched);
      });
    }
    const sources = this.everything();
    const signature = JSON.stringify(sources);
    if (signature === this.signature) return;
    this.signature = signature;
    this.options.log.debug('listening.changed', {});
    this.options.announce();
    this.announceStates(sources);
  }

  private announceStates(sources: readonly ListeningSource[]): void {
    const before = this.states;
    this.states = signalStatesOf(sources);
    for (const source of sources) {
      const state = this.states.get(source.key);
      const previous = before.get(source.key) ?? null;
      if (state === undefined || (previous !== null && sameListeningSignalState(previous, state))) {
        continue;
      }
      this.stateListeners.forEach((listener) => {
        listener({ source, state, previous });
      });
    }
  }
}
