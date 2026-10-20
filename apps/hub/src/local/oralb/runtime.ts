import {
  ORALB_MISSED_LIMIT,
  type BrushAdvert,
  type BrushFrame,
  type BrushStep,
  type DeviceCommand,
  type JsonValue,
  type OralbProfile,
} from '@smarteverything/domain';
import type { OralbHeaderRecord, OralbRecord } from '@smarteverything/ble';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type {
  BrandItem,
  BrandRuntime,
  BrandValues,
  CommandContext,
  DiagnosticsBrand,
  FetchResult,
  HandleView,
  HeadTimeline,
  HeadView,
  RuntimePort,
  ValuesContext,
  ViewContext,
} from '../toothbrush/brand';
import { oralbCommand } from './commands';
import {
  entryProfileOf,
  identityOf,
  oralbSettingsOf,
  scheduleOf,
  withFirmware,
  withOralb,
  withSchedule,
} from './config';
import { OralbDecoder, type Decoded } from './decode';
import { ForceBands } from './force';
import { HeadTracker } from './head';
import { headerDraft, missedStart, runNear, sessionDraft } from './records';
import { OralbState, type Applied } from './state';
import { oralbValues } from './values';
import { oralbDiagnostics, oralbHandleView, oralbHeadTimeline, oralbHeadView } from './views';

type Delta = Extract<Decoded, { readonly kind: 'delta' }>;

const NO_FETCH: FetchResult = { fetch: [], transfer: null };

function pressureCode(pressure: number): 0 | 1 | 2 {
  if (pressure === 0 || pressure === 2) {
    return pressure;
  }
  return 1;
}

export class OralbRuntime implements BrandRuntime {
  readonly snapshot: OralbState;
  readonly transferring = false;
  readonly decoder = new OralbDecoder();
  readonly head: HeadTracker;
  private readonly force: ForceBands;

  constructor(
    entry: LocalDeviceEntry,
    private readonly port: RuntimePort,
  ) {
    const settings = oralbSettingsOf(entry);
    this.snapshot = new OralbState();
    this.head = new HeadTracker(settings.headBaseline, settings.headLast);
    this.force = new ForceBands(settings.forceBands);
    this.snapshot.seedSchedule(scheduleOf(entry));
  }

  get profile(): OralbProfile {
    return entryProfileOf(this.port.entry());
  }

  *decode(frames: readonly BrushFrame[], adverts: readonly BrushAdvert[]): Iterable<BrandItem> {
    const protocol = this.snapshot.protocol ?? identityOf(this.port.entry()).protocol;
    for (const item of this.decoder.decode(frames, adverts, protocol)) {
      yield* item.kind === 'unreadable' ? [item] : this.itemsOf(item);
    }
  }

  reset(): void {
    this.snapshot.resetLink();
  }

  wake(): void {
    this.snapshot.wake();
  }

  sleep(chargingKept: boolean): boolean {
    return this.snapshot.sleep(chargingKept);
  }

  clearPressure(): void {
    this.snapshot.pressure = null;
  }

  observed(): Readonly<Record<string, JsonValue>> {
    const { protocol, modelId, firmware, liveSource } = this.snapshot;
    return { protocol, modelId, firmware, liveSource };
  }

  fetch(): FetchResult {
    return NO_FETCH;
  }

  command(command: DeviceCommand, context: CommandContext): BrushStep[] {
    return oralbCommand(this.snapshot, command, context);
  }

  values(context: ValuesContext): BrandValues {
    return oralbValues({ state: this.snapshot, profile: this.profile, head: this.head }, context);
  }

  headView(context: ViewContext): HeadView {
    return oralbHeadView(context, this.snapshot, this.head);
  }

  handleView(context: ViewContext): HandleView {
    return oralbHandleView(context, this.snapshot);
  }

  headTimeline(context: ViewContext): HeadTimeline {
    return oralbHeadTimeline(context);
  }

  diagnostics(context: ViewContext): DiagnosticsBrand {
    return oralbDiagnostics(context, this.snapshot, this.decoder);
  }

  private itemsOf(item: Delta): BrandItem[] {
    const applied = this.snapshot.apply(item.delta, Date.parse(item.at), item.source);
    this.learn(item, applied);
    const state: BrandItem = { kind: 'state', at: item.at, touched: applied.touched };
    return item.delta.record === undefined
      ? [state]
      : [state, ...this.recordItems(item.delta.record, item.at)];
  }

  private learn(item: Delta, applied: Applied): void {
    const { delta } = item;
    this.learnDevice(delta, applied);
    if (applied.touched.has('head')) {
      this.learnHead(item.at);
    }
    if (delta.forceRaw !== undefined && delta.pressure !== undefined) {
      this.force.note(pressureCode(delta.pressure), Math.max(0, delta.forceRaw) / 1000);
    }
    if (applied.ended !== null) {
      this.learnForce();
    }
  }

  private learnDevice(delta: Delta['delta'], applied: Applied): void {
    const { firmware, pacerS: schedule } = delta;
    if (
      firmware !== undefined &&
      applied.touched.has('extras') &&
      firmware !== identityOf(this.port.entry()).firmware
    ) {
      this.port.persist((config) => withFirmware(config, firmware));
    }
    if (
      schedule !== undefined &&
      schedule.join() !== (scheduleOf(this.port.entry()) ?? []).join()
    ) {
      this.port.persist((config) => withSchedule(config, schedule));
    }
  }

  private learnHead(at: string): void {
    const reading = this.snapshot.headReading;
    if (reading === null) {
      return;
    }
    const block = oralbSettingsOf(this.port.entry());
    const { baseline, changed, last, moved } = this.head.update(reading, at, {
      warnDays: block.headWarnDays,
      dueDays: block.headDueDays,
    });
    if (changed) {
      this.port.persist((config) =>
        withOralb(config, (current) => ({ ...current, headBaseline: baseline, headLast: last })),
      );
    } else if (moved) {
      this.port.persist((config) =>
        withOralb(config, (current) => ({ ...current, headLast: last })),
      );
    }
  }

  private learnForce(): void {
    const bands = this.force.finish();
    if (bands !== null) {
      this.port.persist((config) =>
        withOralb(config, (current) => ({ ...current, forceBands: bands })),
      );
    }
  }

  private recordItems(record: OralbRecord, at: string): BrandItem[] {
    if (record.kind === 'session') {
      return [
        {
          kind: 'record',
          at,
          sessionId: record.sessionId,
          draft: () => sessionDraft(record, this.snapshot),
        },
      ];
    }
    return record.kind === 'header' ? this.headerItems(record, at) : [];
  }

  private headerItems(header: OralbHeaderRecord, at: string): BrandItem[] {
    if (this.port.known(header.sessionId)) {
      return [];
    }
    const match = runNear(header, this.snapshot, this.snapshot.runs);
    if (match !== null) {
      return [
        {
          kind: 'record',
          at,
          sessionId: header.sessionId,
          draft: () => headerDraft(header, match),
        },
      ];
    }
    const start = missedStart(header, this.snapshot);
    if (start === null) {
      return [{ kind: 'record', at, sessionId: header.sessionId, draft: () => null }];
    }
    this.missed(header.sessionId, start);
    return [];
  }

  private missed(handleSessionId: number, startedAt: string): void {
    const block = oralbSettingsOf(this.port.entry());
    if (block.missed.some((entry) => entry.handleSessionId === handleSessionId)) {
      return;
    }
    this.port.persist((config) =>
      withOralb(config, (current) => ({
        ...current,
        missed: [{ handleSessionId, startedAt }, ...current.missed].slice(0, ORALB_MISSED_LIMIT),
      })),
    );
  }
}
