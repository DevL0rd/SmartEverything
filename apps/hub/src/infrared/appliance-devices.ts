import {
  CommandRefusedError,
  type DiscoveredDevice,
  type IrAppliance,
  type IrApplianceRow,
  type IrRemoteState,
  type RowChange,
} from '@smarteverything/domain';
import { driverDeviceId, driverIdOf, type DeviceDriverContext } from '../local/device-driver';
import type { Store } from '../store/store';
import { applianceCapabilities, applianceKindOf, stateValues } from './appliance-model';

export const IR_APPLIANCE_DRIVER = 'ir_appliance';

const MODEL = 'IR appliance';
const MANUFACTURER = 'Infrared';

export type ApplianceDeviceStore = Pick<Store, 'irAppliances' | 'devices' | 'settings' | 'rooms'>;

class ApplianceDriverNotStartedError extends Error {
  override readonly name = 'ApplianceDriverNotStartedError';

  constructor() {
    super('The IR appliance driver has not started yet, so the appliance cannot be shown.');
  }
}

export function applianceExternalId(applianceId: string): string {
  return driverDeviceId(IR_APPLIANCE_DRIVER, applianceId);
}

export function applianceIdOf(externalId: string): string {
  return externalId.slice(IR_APPLIANCE_DRIVER.length + 1);
}

export class ApplianceDevices {
  private context: DeviceDriverContext | null = null;

  constructor(
    private readonly store: ApplianceDeviceStore,
    private readonly now: () => Date,
  ) {}

  async attach(context: DeviceDriverContext): Promise<void> {
    this.context = context;
    const rows = this.store.irAppliances.list();
    await this.publish(rows);
  }

  detach(): void {
    this.context = null;
  }

  listing(row: IrApplianceRow): IrAppliance {
    return {
      ...row,
      device_id: this.deviceOf(row.id)?.id ?? null,
      online: this.onlineOf(row),
      keys: this.store.irAppliances.keys(row.id).map((key) => key.button),
    };
  }

  requireBlaster(blasterId: string): void {
    const blaster = this.store.devices.byId(blasterId);
    if (!blaster.capabilities.some((capability) => capability.key === 'ir_send')) {
      throw new CommandRefusedError('ir_send', `${blaster.name} cannot send infrared`);
    }
  }

  async publish(rows: readonly IrApplianceRow[]): Promise<void> {
    const context = this.started();
    await context.publishDevices(rows.map((row) => this.discovered(row)));
    const at = this.now().toISOString();
    rows.forEach((row) => {
      this.pushState(row.id, this.store.settings.irRemote(row.id), at);
    });
  }

  async forget(applianceIds: readonly string[]): Promise<void> {
    await this.started().forget(applianceIds);
  }

  placeWithBlaster(row: IrApplianceRow, chosenRoomId?: string): void {
    const device = this.deviceOf(row.id);
    const blaster = row.blaster_id === null ? undefined : this.store.devices.find(row.blaster_id);
    const roomId = chosenRoomId ?? blaster?.room_id ?? null;
    if (device?.room_id === null && roomId !== null) {
      this.store.devices.update(device.id, { room_id: roomId });
    }
  }

  pushState(applianceId: string, state: IrRemoteState, observedAt: string): void {
    const context = this.context;
    if (context === null) return;
    const externalId = applianceExternalId(applianceId);
    stateValues(state).forEach((value, capability) => {
      context.sink.state({ externalId, capability, value, observedAt });
    });
  }

  observe(change: RowChange): void {
    if (change.table !== 'devices' || this.context === null) return;
    const device = change.record ?? change.oldRecord;
    if (device === null || driverIdOf(device.external_id) === IR_APPLIANCE_DRIVER) return;
    if (change.record !== null && change.oldRecord?.online === change.record.online) return;
    this.refreshOnline();
  }

  private refreshOnline(): void {
    const context = this.started();
    this.store.irAppliances.list().forEach((row) => {
      const online = this.onlineOf(row);
      if (this.deviceOf(row.id)?.online !== online) {
        context.sink.online(applianceExternalId(row.id), online);
      }
    });
  }

  private started(): DeviceDriverContext {
    if (this.context === null) throw new ApplianceDriverNotStartedError();
    return this.context;
  }

  private deviceOf(applianceId: string): ReturnType<Store['devices']['find']> {
    return this.store.devices.byExternal('local', applianceExternalId(applianceId));
  }

  private onlineOf(row: IrApplianceRow): boolean {
    return row.blaster_id !== null && this.store.devices.find(row.blaster_id)?.online === true;
  }

  private discovered(row: IrApplianceRow): DiscoveredDevice {
    const kind = applianceKindOf(row.category);
    const keys = this.store.irAppliances.keys(row.id).map((key) => key.button);
    return {
      provider: 'local',
      externalId: applianceExternalId(row.id),
      parentExternalId: null,
      kind,
      name: row.name,
      model: MODEL,
      manufacturer: row.brand ?? MANUFACTURER,
      room: null,
      online: this.onlineOf(row),
      capabilities: applianceCapabilities(kind, keys),
      details: {
        irApplianceId: row.id,
        blasterId: row.blaster_id,
        category: row.category,
        encoder: row.encoder,
      },
    };
  }
}
