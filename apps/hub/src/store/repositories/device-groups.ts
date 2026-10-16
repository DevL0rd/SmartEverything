import {
  DEVICE_GROUP_ROW,
  type DeviceGroupInput,
  type DeviceGroupRow,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_GROUP = storedRow(DEVICE_GROUP_ROW, { json: ['device_ids'] });
const COLUMNS = 'id, name, device_ids, created_at, updated_at';

export class DeviceGroupsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): DeviceGroupRow[] {
    return this.context.sql.all(
      STORED_GROUP,
      `select ${COLUMNS} from device_groups order by name, id`,
    );
  }

  byId(id: string): DeviceGroupRow {
    return found(
      this.context.sql.get(STORED_GROUP, `select ${COLUMNS} from device_groups where id = $id`, {
        id,
      }),
      'device group',
      id,
    );
  }

  create(input: DeviceGroupInput): DeviceGroupRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'create the device group',
        `insert into device_groups (${COLUMNS}) values ($id, $name, $members, $now, $now)`,
        { id, name: input.name, members: jsonText(input.device_ids), now: this.context.now() },
      );
      const row = this.byId(id);
      this.context.changed('device_groups', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, input: DeviceGroupInput): DeviceGroupRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'update the device group',
        'update device_groups set name = $name, device_ids = $members, updated_at = $now where id = $id',
        { id, name: input.name, members: jsonText(input.device_ids), now: this.context.now() },
      );
      const row = this.byId(id);
      this.context.changed('device_groups', 'UPDATE', row, before);
      return row;
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the device group', 'delete from device_groups where id = $id', {
        id,
      });
      this.context.changed('device_groups', 'DELETE', null, before);
    });
  }
}
