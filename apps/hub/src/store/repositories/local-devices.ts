import {
  JSON_VALUE,
  LOCAL_DRIVERS,
  type JsonValue,
  type LocalDriver,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

export interface LocalDeviceEntry {
  readonly externalId: string;
  readonly driver: LocalDriver;
  readonly address: string;
  readonly name: string;
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
}

const STORED_ENTRY = z
  .object({
    external_id: z.string().min(1),
    driver: z.enum(LOCAL_DRIVERS),
    address: z.string().min(1),
    name: z.string().min(1),
    config: SQL_JSON.pipe(z.record(z.string(), JSON_VALUE)),
    created_at: z.string(),
  })
  .transform((row): LocalDeviceEntry => ({
    externalId: row.external_id,
    driver: row.driver,
    address: row.address,
    name: row.name,
    config: row.config,
    createdAt: row.created_at,
  }));

const COLUMNS = 'external_id, driver, address, name, config, created_at';

export class LocalDevicesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): LocalDeviceEntry[] {
    return this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from local_devices order by created_at`,
    );
  }

  byExternalId(externalId: string): LocalDeviceEntry {
    return found(
      this.context.sql.get(
        STORED_ENTRY,
        `select ${COLUMNS} from local_devices where external_id = $externalId`,
        {
          externalId,
        },
      ),
      'built-in device',
      externalId,
    );
  }

  add(entry: Omit<LocalDeviceEntry, 'createdAt'>): LocalDeviceEntry {
    this.context.sql.run(
      'add the built-in device',
      `insert into local_devices (external_id, driver, address, name, config, created_at)
       values ($externalId, $driver, $address, $name, $config, $now)`,
      {
        externalId: entry.externalId,
        driver: entry.driver,
        address: entry.address,
        name: entry.name,
        config: jsonText(entry.config),
        now: this.context.now(),
      },
    );
    return this.byExternalId(entry.externalId);
  }

  remove(externalId: string): void {
    this.context.sql.run(
      'remove the built-in device',
      'delete from local_devices where external_id = $externalId',
      { externalId },
    );
  }
}
