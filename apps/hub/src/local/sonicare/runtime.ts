import type {
  BrushAdvert,
  BrushFrame,
  BrushStep,
  DeviceCommand,
  JsonValue,
  SonicareProfile,
} from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type {
  BrandItem,
  BrandRuntime,
  BrandValues,
  CommandContext,
  DiagnosticsBrand,
  FetchContext,
  FetchResult,
  HandleView,
  HeadTimeline,
  HeadView,
  ValuesContext,
  ViewContext,
} from '../toothbrush/brand';
import { JSON_VALUE } from '@smarteverything/domain';
import { sonicareCommand } from './commands';
import { effectiveIdentity, entryConfigOf, entryProfileOf, entrySettingsOf } from './config';
import { BrushDecoder, type Decoded } from './decode';
import { fetchFor } from './fetch';
import { retainedDraft } from './records';
import { BrushState } from './state';
import { sonicareValues } from './values';
import {
  sonicareDiagnostics,
  sonicareHandleView,
  sonicareHeadTimeline,
  sonicareHeadView,
} from './views';

export class SonicareRuntime implements BrandRuntime {
  readonly profile: SonicareProfile;
  readonly snapshot: BrushState;
  private readonly decoder: BrushDecoder;
  private readonly model: string | null;

  constructor(entry: LocalDeviceEntry) {
    const config = entryConfigOf(entry);
    this.profile = entryProfileOf(entry);
    this.model = config.identity.model;
    this.snapshot = new BrushState(
      this.profile,
      effectiveIdentity(config.identity, entrySettingsOf(entry)).model,
    );
    this.decoder = new BrushDecoder(this.profile.family === 'kids');
  }

  get transferring(): boolean {
    return this.decoder.transferring;
  }

  *decode(frames: readonly BrushFrame[], _adverts: readonly BrushAdvert[]): Iterable<BrandItem> {
    for (const frame of frames) {
      for (const item of this.decoder.decode(frame)) {
        yield this.itemOf(item);
      }
    }
  }

  reset(): void {
    this.decoder.reset();
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
    const { extras, head } = this.snapshot;
    return {
      firmware: extras.firmware,
      headRing: head.ring,
      nfcVersion: extras.nfcVersion,
      nfcUrl: extras.nfcUrl,
      calibration: JSON_VALUE.parse([...extras.calibration]),
      easyStart: extras.easyStart,
      sensorMask: extras.sensorMask,
      settingsBits: extras.settingsBits,
      errorPersistent: extras.errorPersistent,
      errorVolatile: extras.errorVolatile,
      handleClock: this.snapshot.handleClock,
      latestStoredId: this.snapshot.latestStoredId,
      lifetimeSessions: this.snapshot.storedCount,
    };
  }

  fetch(context: FetchContext): FetchResult {
    return fetchFor({
      ...context,
      profile: this.profile,
      latest: this.snapshot.latestStoredId,
    });
  }

  command(command: DeviceCommand, context: CommandContext): BrushStep[] {
    return sonicareCommand(this.snapshot, command, context);
  }

  values(context: ValuesContext): BrandValues {
    return sonicareValues(this.snapshot, this.profile, context);
  }

  headView(context: ViewContext): HeadView {
    return sonicareHeadView(context, this.snapshot);
  }

  handleView(context: ViewContext): HandleView {
    return sonicareHandleView(context, this.snapshot);
  }

  headTimeline(context: ViewContext): HeadTimeline {
    return sonicareHeadTimeline(context, this.snapshot);
  }

  diagnostics(context: ViewContext): DiagnosticsBrand {
    return sonicareDiagnostics(context, this.snapshot);
  }

  private itemOf(item: Decoded): BrandItem {
    switch (item.kind) {
      case 'delta':
        return {
          kind: 'state',
          at: item.at,
          touched: this.snapshot.apply(item.delta, Date.parse(item.at)),
        };
      case 'record':
        return {
          kind: 'record',
          at: item.at,
          sessionId: item.record.sessionId,
          draft: (now) =>
            retainedDraft(
              {
                profile: this.profile,
                model: this.model,
                routineIds: this.snapshot.routineIds,
                handleClock: this.snapshot.handleClock,
                handleClockAtMs: this.snapshot.handleClockAtMs,
                headSerial: this.snapshot.head.serial,
              },
              item.record,
              now,
            ),
        };
      case 'ended':
        return { kind: 'ended', at: item.at, sessionId: item.sessionId };
      case 'refused':
        return { kind: 'refused', at: item.at, status: item.status };
      case 'unreadable':
        return item;
    }
  }
}
