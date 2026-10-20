import type {
  BleContentFilter,
  BrushAction,
  BrushActionResult,
  BrushAdvert,
  BrushBatchResult,
  BrushActivity,
  BrushFrame,
  BrushHeadType,
  BrushIntensity,
  BrushLinkPlan,
  BrushMode,
  BrushPressure,
  BrushProfile,
  BrushSessionRules,
  BrushSettings,
  BrushSettingsChange,
  BrushStep,
  BrushView,
  CapabilityKey,
  DeviceCapability,
  DeviceCommand,
  DeviceRow,
  EventKind,
  JsonValue,
  LiveSource,
  LocalDeviceSetup,
  LocalDriver,
  SessionPressure,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { ResolvedSetup } from '../setup-types';
import type { Actor, ActDeps } from './acts';
import type { DeviceState } from './fleet';
import type { ViewDeps } from './view-deps';

export type TouchedNames = ReadonlySet<string>;

export interface SnapshotHead {
  readonly serial: string | null | undefined;
  readonly type: BrushHeadType | null;
  readonly usageS: number | null;
  readonly limitS: number | null;
}

export type EndHint = 'complete' | 'aborted';

export interface BrushSnapshot {
  readonly activity: BrushActivity;
  readonly elapsedS: number;
  readonly routineS: number | null;
  readonly mode: BrushMode | null;
  readonly intensity: BrushIntensity | null;
  readonly pressure: BrushPressure | null;
  readonly pressureValue: number | null;
  readonly temperatureC: number | null;
  readonly zone: number | null;
  readonly zoneSeconds: readonly number[];
  readonly sectorS: number | null;
  readonly force: number | null;
  readonly angleDeg: number | null;
  readonly face: number | null;
  readonly battery: number | null;
  readonly batteryMillivolts: number | null;
  readonly sessionId: number | null;
  readonly head: SnapshotHead;
  readonly endHint: EndHint | null;
  readonly faults: readonly (number | null)[] | null;
  readonly liveSource: LiveSource | null;
}

export type DraftPressure = Omit<SessionPressure, 'strip'>;

export interface RuntimePort {
  readonly entry: () => LocalDeviceEntry;
  readonly persist: (
    change: (config: LocalDeviceEntry['config']) => LocalDeviceEntry['config'],
  ) => void;
  readonly known: (handleSessionId: number) => boolean;
}

export interface RetainedDraft {
  readonly handleSessionId: number;
  readonly startedAt: string;
  readonly durationS: number;
  readonly routineS: number;
  readonly mode: BrushMode | null;
  readonly intensity: BrushIntensity | null;
  readonly complete: boolean;
  readonly zones: readonly number[] | null;
  readonly details: BrushingDetails | null;
  readonly pressure: DraftPressure | null;
  readonly headSerial: string | null;
}

export type BrushingDetails = NonNullable<
  Extract<BrushView, { readonly view: 'session' }>['session']['details']
>;

export type BrandItem =
  | { readonly kind: 'state'; readonly at: string; readonly touched: TouchedNames }
  | {
      readonly kind: 'record';
      readonly at: string;
      readonly sessionId: number;
      readonly draft: (now: Date) => RetainedDraft | null;
    }
  | { readonly kind: 'ended'; readonly at: string; readonly sessionId: number }
  | {
      readonly kind: 'unreadable';
      readonly characteristic: string;
      readonly hex: string;
      readonly reason: string;
    }
  | { readonly kind: 'refused'; readonly at: string; readonly status: string };

export type CapabilityEntry = readonly [CapabilityKey, JsonValue];

export interface BrandEvent {
  readonly kind: EventKind;
  readonly at: string;
  readonly details: Readonly<Record<string, JsonValue>>;
  readonly occurrence: string;
}

export interface BrandValues {
  readonly entries: readonly CapabilityEntry[];
  readonly metrics: readonly (readonly [string, number])[];
  readonly events: readonly BrandEvent[];
}

export interface ValuesContext {
  readonly touched: TouchedNames;
  readonly at: string;
  readonly brushedSeconds: number;
}

export interface ViewContext {
  readonly deps: ViewDeps;
  readonly device: DeviceRow;
  readonly entry: LocalDeviceEntry;
  readonly brushedSeconds: number;
  readonly faulty: boolean;
}

type StateView = Extract<BrushView, { readonly view: 'state' }>;

export type HeadView = StateView['head'];

export type HandleView = StateView['handle'];

export type DiagnosticsBrand = Extract<BrushView, { readonly view: 'diagnostics' }>['brand'];

export type HeadTimeline = Pick<
  Extract<BrushView, { readonly view: 'head' }>,
  'timeline' | 'perDayS'
>;

export interface BrandRuntime {
  readonly profile: BrushProfile;
  readonly snapshot: BrushSnapshot;
  readonly transferring: boolean;
  decode(frames: readonly BrushFrame[], adverts: readonly BrushAdvert[]): Iterable<BrandItem>;
  reset(): void;
  wake(): void;
  sleep(chargingKept: boolean): boolean;
  clearPressure(): void;
  observed(): Readonly<Record<string, JsonValue>>;
  fetch(context: FetchContext): FetchResult;
  command(command: DeviceCommand, context: CommandContext): BrushStep[];
  values(context: ValuesContext): BrandValues;
  headView(context: ViewContext): HeadView;
  handleView(context: ViewContext): HandleView;
  headTimeline(context: ViewContext): HeadTimeline;
  diagnostics(context: ViewContext): DiagnosticsBrand;
}

export interface FetchContext {
  readonly state: DeviceState;
  readonly stored: () => ReadonlySet<number>;
  readonly nowMs: number;
}

export type FetchResult = Pick<BrushBatchResult, 'fetch' | 'transfer'>;

export interface CommandContext {
  readonly state: DeviceState;
  readonly owner: () => boolean;
}

export interface ActContext {
  readonly deps: ActDeps;
  readonly device: DeviceRow;
  readonly actor: Actor;
}

export interface Writes {
  readonly allowed: boolean;
  readonly reason: string | null;
}

export interface BrushBrand {
  readonly driver: LocalDriver;
  readonly brand: BrushProfile['brand'];
  readonly rules: BrushSessionRules;
  profileOf(entry: LocalDeviceEntry): BrushProfile;
  settingsOf(raw: unknown): BrushSettings;
  modelOf(entry: LocalDeviceEntry): string | null;
  runtime(entry: LocalDeviceEntry, port: RuntimePort): BrandRuntime;
  plan(
    device: Pick<DeviceRow, 'id'>,
    state: DeviceState,
    holder: boolean,
    now: Date,
  ): BrushLinkPlan;
  capabilities(entry: LocalDeviceEntry): DeviceCapability[];
  modes(entry: LocalDeviceEntry): readonly BrushMode[];
  writes(state: DeviceState): Writes;
  act(action: BrushAction, context: ActContext): Promise<BrushActionResult>;
  mergeSettings(
    merged: BrushSettings,
    before: BrushSettings,
    change: BrushSettingsChange,
  ): BrushSettings;
  savedConfig(entry: LocalDeviceEntry, settings: BrushSettings): LocalDeviceEntry['config'];
  contentFilters(entries: readonly LocalDeviceEntry[]): BleContentFilter[];
  setup(setup: LocalDeviceSetup): Promise<ResolvedSetup>;
}
