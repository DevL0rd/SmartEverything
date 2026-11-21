import {
  CommandRefusedError,
  EMPTY_IR_REMOTE_STATE,
  type DeviceRow,
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

export type ApplianceDeviceStore = Pick<Store, 'host' | 'live'>;

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

export function irRemoteOf(store: Pick<Store, 'live'>, remoteId: string): IrRemoteState {
  return store.live.home.settings.read().ir_remotes[remoteId] ?? EMPTY_IR_REMOTE_STATE;
}

export class ApplianceDevices {
  private context: DeviceDriverContext | null = null;

  constructor(
    private readonly store: ApplianceDeviceStore,
    private readonly now: () => Date,
  ) {}

  async attach(context: DeviceDriverContext): Promise<void> {
    this.context = context;
    const rows = await this.store.host.call('irAppliances', 'list');
    await this.publish(rows);
  }

  detach(): void {
    this.context = null;
  }

  async listing(row: IrApplianceRow): Promise<IrAppliance> {
    const keys = await this.store.host.call('irAppliances', 'keys', row.id);
    return {
      ...row,
      device_id: this.deviceOf(row.id)?.id ?? null,
      online: this.onlineOf(row),
      keys: keys.map((key) => key.button),
    };
  }

  requireBlaster(blasterId: string): void {
    const blaster = this.store.live.home.devices.byId(blasterId);
    if (!blaster.capabilities.some((capability) => capability.key === 'ir_send')) {
      throw new CommandRefusedError('ir_send', `${blaster.name} cannot send infrared`);
    }
  }

  async publish(rows: readonly IrApplianceRow[]): Promise<void> {
    const context = this.started();
    const discovered = await Promise.all(rows.map((row) => this.discovered(row)));
    await context.publishDevices(discovered);
    const at = this.now().toISOString();
    rows.forEach((row) => {
      this.pushState(row.id, irRemoteOf(this.store, row.id), at);
    });
  }

  async forget(applianceIds: readonly string[]): Promise<void> {
    await this.started().forget(applianceIds);
  }

  async placeWithBlaster(row: IrApplianceRow, chosenRoomId?: string): Promise<void> {
    const { devices } = this.store.live.home;
    const device = this.deviceOf(row.id);
    const blaster = row.blaster_id === null ? undefined : devices.find(row.blaster_id);
    const roomId = chosenRoomId ?? blaster?.room_id ?? null;
    if (device?.room_id === null && roomId !== null) {
      await this.store.host.call('devices', 'update', device.id, { room_id: roomId });
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
    const { devices } = this.store.live.home;
    for (const device of devices.list()) {
      if (driverIdOf(device.external_id) !== IR_APPLIANCE_DRIVER) continue;
      const blasterId = device.details['blasterId'];
      const online = typeof blasterId === 'string' && devices.find(blasterId)?.online === true;
      if (device.online !== online) context.sink.online(device.external_id, online);
    }
  }

  private started(): DeviceDriverContext {
    if (this.context === null) throw new ApplianceDriverNotStartedError();
    return this.context;
  }

  private deviceOf(applianceId: string): DeviceRow | undefined {
    return this.store.live.home.devices.byExternal('local', applianceExternalId(applianceId));
  }

  private onlineOf(row: IrApplianceRow): boolean {
    return (
      row.blaster_id !== null && this.store.live.home.devices.find(row.blaster_id)?.online === true
    );
  }

  private async discovered(row: IrApplianceRow): Promise<DiscoveredDevice> {
    const kind = applianceKindOf(row.category);
    const keys = (await this.store.host.call('irAppliances', 'keys', row.id)).map(
      (key) => key.button,
    );
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
