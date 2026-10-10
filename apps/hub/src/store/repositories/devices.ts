import { DEVICE_ROW, type DeviceRow } from '@smarteverything/domain';
import type { DeviceUpsert } from '../../database/port';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_DEVICE = storedRow(DEVICE_ROW, {
  flags: ['online', 'hidden', 'favourite'],
  json: ['capabilities', 'details'],
});

const COLUMNS =
  'id, provider, external_id, parent_id, kind, name, display_name, model, manufacturer, provider_room, room_id, online, capabilities, details, hidden, favourite, position, created_at, updated_at';

export interface DevicePatch {
  readonly display_name?: string | null | undefined;
  readonly room_id?: string | null | undefined;
  readonly hidden?: boolean | undefined;
  readonly favourite?: boolean | undefined;
  readonly position?: number | undefined;
}

const UPSERT = `insert into devices (
    id, provider, external_id, parent_id, kind, name, model, manufacturer, provider_room, room_id,
    online, capabilities, details, created_at, updated_at
  ) values (
    $id, $provider, $externalId, $parentId, $kind, $name, $model, $manufacturer, $providerRoom,
    $roomId, $online, $capabilities, $details, $now, $now
  )
  on conflict (provider, external_id) do update set
    parent_id = excluded.parent_id,
    kind = excluded.kind,
    name = excluded.name,
    model = excluded.model,
    manufacturer = excluded.manufacturer,
    provider_room = excluded.provider_room,
    room_id = coalesce(devices.room_id, excluded.room_id),
    online = excluded.online,
    capabilities = excluded.capabilities,
    details = excluded.details,
    updated_at = excluded.updated_at`;

export class DevicesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): DeviceRow[] {
    return this.context.sql.all(
      STORED_DEVICE,
      `select ${COLUMNS} from devices order by position, name, id`,
    );
  }

  byId(id: string): DeviceRow {
    return found(this.find(id), 'device', id);
  }

  find(id: string): DeviceRow | undefined {
    return this.context.sql.get(STORED_DEVICE, `select ${COLUMNS} from devices where id = $id`, {
      id,
    });
  }

  update(id: string, patch: DevicePatch): DeviceRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const { hidden, favourite, ...plain } = patch;
      const set = assignments({
        ...Object.fromEntries(Object.entries(plain)),
        ...(hidden === undefined ? {} : { hidden: flag(hidden) }),
        ...(favourite === undefined ? {} : { favourite: flag(favourite) }),
        updated_at: this.context.now(),
      });
      this.context.sql.run('change the device', `update devices set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      return this.announce(before);
    });
  }

  upsert(devices: readonly DeviceUpsert[]): DeviceRow[] {
    return this.context.write(() => devices.map((device) => this.upsertOne(device)));
  }

  setOnline(ids: readonly string[], online: boolean): DeviceRow[] {
    return this.context.write(() =>
      ids.flatMap((id) => {
        const before = this.find(id);
        if (before === undefined) {
          return [];
        }
        this.context.sql.run(
          'change whether the device is online',
          'update devices set online = $online, updated_at = $now where id = $id',
          { id, online: flag(online), now: this.context.now() },
        );
        return [this.announce(before)];
      }),
    );
  }

  remove(ids: readonly string[]): DeviceRow[] {
    return this.context.write(() =>
      ids.flatMap((id) => {
        const before = this.find(id);
        if (before === undefined) {
          return [];
        }
        this.context.sql.run('remove the device', 'delete from devices where id = $id', { id });
        this.context.changed('devices', 'DELETE', null, before);
        return [before];
      }),
    );
  }

  unplace(roomId: string): void {
    for (const device of this.list().filter((candidate) => candidate.room_id === roomId)) {
      this.update(device.id, { room_id: null });
    }
  }

  private upsertOne(device: DeviceUpsert): DeviceRow {
    const before = this.context.sql.get(
      STORED_DEVICE,
      `select ${COLUMNS} from devices where provider = $provider and external_id = $externalId`,
      { provider: device.provider, externalId: device.externalId },
    );
    const id = before?.id ?? this.context.newId();
    this.context.sql.run('save the device', UPSERT, {
      id,
      provider: device.provider,
      externalId: device.externalId,
      parentId: device.parentId,
      kind: device.kind,
      name: device.name,
      model: device.model,
      manufacturer: device.manufacturer,
      providerRoom: device.providerRoom,
      roomId: device.roomId,
      online: flag(device.online),
      capabilities: jsonText(device.capabilities),
      details: jsonText(device.details),
      now: this.context.now(),
    });
    if (before === undefined) {
      const row = this.byId(id);
      this.context.changed('devices', 'INSERT', row, null);
      return row;
    }
    return this.announce(before);
  }

  private announce(before: DeviceRow): DeviceRow {
    const after = this.byId(before.id);
    this.context.changed('devices', 'UPDATE', after, before);
    return after;
  }
}
