import {
  DRIVE_BACKUP_REPORT,
  DRIVE_BACKUP_STATUS,
  type DriveBackupReport,
  type DriveBackupReportInput,
  type DriveBackupStatus,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

const REPORT_COLUMNS = z.strictObject({
  at: z.string(),
  reporter: z.string(),
  bytes: z.number(),
  ok: z.boolean(),
});

const STORED_REPORT = storedRow(
  REPORT_COLUMNS.transform((row): DriveBackupReport => DRIVE_BACKUP_REPORT.parse(row)),
  { flags: ['ok'] },
);

export class DriveBackupsRepository {
  constructor(private readonly context: StoreContext) {}

  record(input: DriveBackupReportInput): DriveBackupReport {
    return this.context.write(() => {
      const at = this.context.now();
      this.context.sql.run(
        'record the drive backup',
        'insert into drive_backups (at, reporter, bytes, ok) values ($at, $reporter, $bytes, $ok)',
        { at, reporter: input.reporter, bytes: input.bytes, ok: input.ok ? 1 : 0 },
      );
      return DRIVE_BACKUP_REPORT.parse({
        at,
        reporter: input.reporter,
        bytes: input.bytes,
        ok: input.ok,
      });
    });
  }

  last(): DriveBackupReport | null {
    return (
      this.context.sql.get(
        STORED_REPORT,
        'select at, reporter, bytes, ok from drive_backups order by at desc, id desc limit 1',
      ) ?? null
    );
  }

  lastOk(): DriveBackupReport | null {
    return (
      this.context.sql.get(
        STORED_REPORT,
        'select at, reporter, bytes, ok from drive_backups where ok = 1 order by at desc, id desc limit 1',
      ) ?? null
    );
  }

  status(): DriveBackupStatus {
    return DRIVE_BACKUP_STATUS.parse({
      last: this.last(),
      lastOkAt: this.lastOk()?.at ?? null,
    });
  }
}
