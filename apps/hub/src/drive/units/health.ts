import type { DriveBackupReport, DriveBackupReportInput, DriveRoot } from '@smarteverything/domain';
import { z } from 'zod';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { inList } from '../../store/sql';
import { driveAccess, type DriveActor } from '../access';

const COUNTS = z.object({ files: z.number(), hashed: z.number() });

const VERIFIED = z.object({ verified: z.number(), corrupt: z.number() });

export interface DriveHealthFigures {
  readonly roots: readonly DriveRoot[];
  readonly files: number;
  readonly hashed: number;
  readonly verified: number;
  readonly corrupt: number;
}

function counts(
  store: Pick<HostStore, 'context'>,
  ids: readonly string[],
): z.output<typeof COUNTS> {
  const filter = inList('root_id', 'roots', ids);
  return (
    store.context.sql.get(
      COUNTS,
      `select count(*) as files, count(sha256) as hashed from drive_items
        where kind <> 'folder' and ${filter.text}`,
      filter.parameters,
    ) ?? { files: 0, hashed: 0 }
  );
}

function verified(
  store: Pick<HostStore, 'context'>,
  ids: readonly string[],
): z.output<typeof VERIFIED> {
  const filter = inList('s.root_id', 'roots', ids);
  return (
    store.context.sql.get(
      VERIFIED,
      `select coalesce(sum(s.result = 'ok' and i.sha256 is not null), 0) as verified,
          coalesce(sum(s.result = 'corrupt'), 0) as corrupt
        from drive_scrub s join drive_items i on i.id = s.item_id where ${filter.text}`,
      filter.parameters,
    ) ?? { verified: 0, corrupt: 0 }
  );
}

export function healthFigures(
  store: Pick<HostStore, 'context' | 'driveRoots'>,
  input: { readonly actor: DriveActor },
): DriveHealthFigures {
  const roots = store.driveRoots
    .list()
    .filter((root) => driveAccess(input.actor, root) !== 'none')
    .map(({ path: _path, ...root }) => root);
  const ids = roots.map((root) => root.id);
  return { roots, ...counts(store, ids), ...verified(store, ids) };
}

export function backupReport(
  store: Pick<HostStore, 'driveBackups' | 'driveRoots'>,
  input: DriveBackupReportInput,
): DriveBackupReport {
  const report = store.driveBackups.record(input);
  if (report.ok) {
    for (const root of store.driveRoots.list()) {
      store.driveRoots.update(root.id, { health: { ...root.health, lastBackupAt: report.at } });
    }
  }
  return report;
}

export const DRIVE_HEALTH_FIGURES_UNIT = storeUnit(healthFigures);

export const DRIVE_BACKUP_REPORT_UNIT = storeUnit(backupReport);
