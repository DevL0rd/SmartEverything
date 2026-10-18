import {
  TELEVISION_SETTINGS_ROW,
  type TelevisionInputNames,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SETTINGS = storedRow(TELEVISION_SETTINGS_ROW, {
  flags: ['direct_link'],
  json: ['input_names'],
});

const COLUMNS = 'device_id, direct_link, input_names';

export class TelevisionSettingsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): TelevisionSettingsRow[] {
    return this.context.sql.all(
      STORED_SETTINGS,
      `select ${COLUMNS} from television_settings order by device_id`,
    );
  }

  find(deviceId: string): TelevisionSettingsRow | undefined {
    return this.context.sql.get(
      STORED_SETTINGS,
      `select ${COLUMNS} from television_settings where device_id = $deviceId`,
      { deviceId },
    );
  }

  setInputNames(deviceId: string, names: TelevisionInputNames): TelevisionSettingsRow {
    return this.context.write(() => {
      const before = this.find(deviceId);
      this.context.sql.run(
        'save the television input names',
        `insert into television_settings (device_id, input_names) values ($deviceId, $names)
         on conflict (device_id) do update set input_names = excluded.input_names`,
        { deviceId, names: jsonText(names) },
      );
      return this.announce(deviceId, before);
    });
  }

  setDirectLink(deviceId: string | null): void {
    this.context.write(() => {
      for (const row of this.list()) {
        if (row.direct_link && row.device_id !== deviceId) {
          this.context.sql.run(
            'detach the television direct link',
            'update television_settings set direct_link = 0 where device_id = $deviceId',
            { deviceId: row.device_id },
          );
          this.announce(row.device_id, row);
        }
      }
      if (deviceId === null) {
        return;
      }
      const before = this.find(deviceId);
      if (before?.direct_link === true) {
        return;
      }
      this.context.sql.run(
        'attach the television direct link',
        `insert into television_settings (device_id, direct_link)
         select id, 1 from devices where id = $deviceId
         on conflict (device_id) do update set direct_link = 1`,
        { deviceId },
      );
      if (this.find(deviceId) !== undefined) {
        this.announce(deviceId, before);
      }
    });
  }

  private announce(
    deviceId: string,
    before: TelevisionSettingsRow | undefined,
  ): TelevisionSettingsRow {
    const after = this.find(deviceId);
    if (after === undefined) {
      throw new Error(`The television settings of device ${deviceId} were not stored.`);
    }
    this.context.changed(
      'television_settings',
      before === undefined ? 'INSERT' : 'UPDATE',
      after,
      before ?? null,
    );
    return after;
  }
}
