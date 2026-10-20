import {
  TELEVISION_SETTINGS_ROW,
  type TelevisionInputNames,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SETTINGS = storedRow(TELEVISION_SETTINGS_ROW, {
  json: ['input_names', 'wake_macs'],
});

const COLUMNS = 'device_id, direct_host, direct_mac, input_names, wake_macs, wake_worked_at';

export interface DirectAddress {
  readonly deviceId: string;
  readonly host: string;
  readonly macAddress: string;
}

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

  setWakeAddress(deviceId: string, mac: string | null): TelevisionSettingsRow {
    return this.context.write(() => {
      const before = this.find(deviceId);
      this.context.sql.run(
        'save the television wake address',
        `insert into television_settings (device_id, wake_macs, wake_worked_at) values ($deviceId, $macs, null)
         on conflict (device_id) do update set wake_macs = excluded.wake_macs, wake_worked_at = null`,
        { deviceId, macs: jsonText(mac === null ? [] : [mac]) },
      );
      return this.announce(deviceId, before);
    });
  }

  recordWakeWorked(deviceId: string, at: string): TelevisionSettingsRow {
    return this.context.write(() => {
      const before = this.find(deviceId);
      this.context.sql.run(
        'record that the television woke',
        'update television_settings set wake_worked_at = $at where device_id = $deviceId',
        { deviceId, at },
      );
      return this.announce(deviceId, before);
    });
  }

  setDirectLinks(links: readonly DirectAddress[]): void {
    this.context.write(() => {
      const linked = new Set(links.map((link) => link.deviceId));
      for (const row of this.list()) {
        if (row.direct_mac !== null && !linked.has(row.device_id)) {
          this.storeDirect(row.device_id, null, row);
        }
      }
      for (const link of links) {
        const before = this.find(link.deviceId);
        if (before?.direct_host !== link.host || before.direct_mac !== link.macAddress) {
          this.storeDirect(link.deviceId, link, before);
        }
      }
    });
  }

  private storeDirect(
    deviceId: string,
    link: DirectAddress | null,
    before: TelevisionSettingsRow | undefined,
  ): void {
    this.context.sql.run(
      'save the television direct link',
      `insert into television_settings (device_id, direct_host, direct_mac)
       select id, $host, $mac from devices where id = $deviceId
       on conflict (device_id) do update set direct_host = excluded.direct_host, direct_mac = excluded.direct_mac`,
      { deviceId, host: link?.host ?? null, mac: link?.macAddress ?? null },
    );
    if (this.find(deviceId) !== undefined) {
      this.announce(deviceId, before);
    }
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
