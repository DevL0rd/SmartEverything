import {
  CommandRefusedError,
  afterIrSend,
  modeKeysOf,
  withIrChange,
  type IrAppliance,
  type IrApplianceApply,
  type IrApplianceKeyRow,
  type IrApplianceRow,
  type IrRemoteState,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { LEARNED_ENCODER, type SavedKey } from '../store/repositories/ir-appliances';
import { ApplianceDevices, type ApplianceDeviceStore } from './appliance-devices';
import type { IrEncoders, IrFrame } from './encoders';
import { LIBRARY_ENCODER_PREFIX } from './library/climate-encoder';
import type { IrLibrary } from './library/ir-library';

export interface IrTransport {
  readonly send: (blasterId: string, frame: IrFrame) => Promise<void>;
}

export type IrApplianceStore = ApplianceDeviceStore & Pick<Store, 'irAppliances' | 'settings'>;

export interface IrApplianceServiceOptions {
  readonly store: IrApplianceStore;
  readonly transport: IrTransport;
  readonly encoders: IrEncoders;
  readonly library: IrLibrary;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface LibraryAppliance {
  readonly libraryId: string;
  readonly blasterId: string;
  readonly name: string;
  readonly roomId?: string;
}

export class IrApplianceService {
  readonly devices: ApplianceDevices;
  readonly library: IrLibrary;
  private readonly lanes = new Map<string, Promise<unknown>>();

  constructor(private readonly options: IrApplianceServiceOptions) {
    this.devices = new ApplianceDevices(options.store, options.now);
    this.library = options.library;
  }

  list(): IrAppliance[] {
    return this.options.store.irAppliances.list().map((row) => this.devices.listing(row));
  }

  async promote(remoteId: string): Promise<IrAppliance> {
    const row = this.options.store.irAppliances.promote(remoteId);
    await this.devices.publish([row]);
    this.devices.placeWithBlaster(row);
    this.options.log.info('ir.remote_promoted', { applianceId: row.id, blasterId: row.blaster_id });
    return this.devices.listing(row);
  }

  async createFromLibrary(input: LibraryAppliance): Promise<IrAppliance> {
    this.devices.requireBlaster(input.blasterId);
    if (input.roomId !== undefined) {
      this.options.store.rooms.byId(input.roomId);
    }
    const { library } = this.options;
    const entry = library.entry(input.libraryId);
    const model = library.model(entry.id);
    const row = this.options.store.irAppliances.create({
      blasterId: input.blasterId,
      name: input.name,
      category: entry.category,
      brand: entry.brand,
      encoder: model.kind === 'climate' ? `${LIBRARY_ENCODER_PREFIX}:${entry.id}` : LEARNED_ENCODER,
      keys:
        model.kind === 'keys'
          ? Object.entries(model.keys).map(([button, code]) => ({ button, format: 'pulses', code }))
          : [],
    });
    await this.devices.publish([row]);
    this.devices.placeWithBlaster(row, input.roomId);
    this.options.log.info('ir.appliance_added_from_library', {
      applianceId: row.id,
      libraryId: entry.id,
      blasterId: input.blasterId,
    });
    return this.devices.listing(row);
  }

  async rebind(applianceId: string, blasterId: string): Promise<IrAppliance> {
    this.devices.requireBlaster(blasterId);
    const row = this.options.store.irAppliances.rebind(applianceId, blasterId);
    await this.devices.publish([row]);
    this.options.log.info('ir.appliance_rebound', { applianceId, blasterId });
    return this.devices.listing(row);
  }

  async saveKey(applianceId: string, key: SavedKey): Promise<IrAppliance> {
    this.options.store.irAppliances.saveKey(applianceId, key);
    const row = this.options.store.irAppliances.byId(applianceId);
    await this.devices.publish([row]);
    return this.devices.listing(row);
  }

  async remove(applianceId: string): Promise<void> {
    this.options.store.irAppliances.remove(applianceId);
    this.options.store.settings.forgetIrRemote(applianceId);
    await this.devices.forget([applianceId]);
    this.options.log.info('ir.appliance_removed', { applianceId });
  }

  apply(applianceId: string, goal: IrApplianceApply): Promise<IrRemoteState> {
    return this.serial(applianceId, async () => {
      const { row, keys } = this.bound(applianceId);
      const frames = this.options.encoders
        .of(row.encoder)
        .frames(keys, this.options.store.settings.irRemote(row.id), goal);
      await this.sendAll(row, keys, frames);
      return this.remember(row.id, (state) => withIrChange(state, goal));
    });
  }

  press(applianceId: string, button: string): Promise<IrRemoteState> {
    return this.serial(applianceId, async () => {
      const { row, keys } = this.bound(applianceId);
      const key = keys.find((candidate) => candidate.button === button);
      if (key === undefined) {
        throw new CommandRefusedError('remote_key', `${row.name} has no button ${button}`);
      }
      await this.sendAll(row, keys, [{ key: key.button, format: key.format, code: key.code }]);
      return this.options.store.settings.irRemote(row.id);
    });
  }

  private bound(applianceId: string): {
    readonly row: IrApplianceRow & { readonly blaster_id: string };
    readonly keys: readonly IrApplianceKeyRow[];
  } {
    const row = this.options.store.irAppliances.byId(applianceId);
    const blasterId = row.blaster_id;
    if (blasterId === null) {
      throw new CommandRefusedError(
        'ir_send',
        `${row.name} has no IR blaster, bind it to one first`,
      );
    }
    return {
      row: { ...row, blaster_id: blasterId },
      keys: this.options.store.irAppliances.keys(row.id),
    };
  }

  private async sendAll(
    row: IrApplianceRow & { readonly blaster_id: string },
    keys: readonly IrApplianceKeyRow[],
    frames: readonly IrFrame[],
  ): Promise<void> {
    const modes = modeKeysOf(keys.map((key) => key.button));
    for (const frame of frames) {
      await this.options.transport.send(row.blaster_id, frame);
      const at = this.options.now().toISOString();
      this.remember(row.id, (state) => afterIrSend(state, frame.key, modes, at));
    }
    this.options.log.debug('ir.appliance_sent', { applianceId: row.id, frames: frames.length });
  }

  private remember(
    applianceId: string,
    change: (state: IrRemoteState) => IrRemoteState,
  ): IrRemoteState {
    this.options.store.settings.changeIrRemote(applianceId, change);
    const state = this.options.store.settings.irRemote(applianceId);
    this.devices.pushState(applianceId, state, this.options.now().toISOString());
    return state;
  }

  private serial<T>(applianceId: string, work: () => Promise<T>): Promise<T> {
    const next = (this.lanes.get(applianceId) ?? Promise.resolve()).then(work, work);
    this.lanes.set(
      applianceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}
