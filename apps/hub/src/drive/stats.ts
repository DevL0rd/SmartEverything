import {
  DRIVE_STATS,
  SMART_RULE_ITEM_KINDS,
  driveHistoryShown,
  type DriveDataSpace,
  type DriveStats,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../store/context';
import { DriveDaysRepository, type DriveDay } from '../store/repositories/drive-days';
import { inList } from '../store/sql';
import { driveFilter, type DriveActor } from './access';

const DAY_MS = 86_400_000;

const MONTH_DAYS = 30.4375;

const FIRST_DAY = '0000-01-01';

const LAST_DAY = '9999-12-31';

const KIND_ROW = z.object({ kind: z.string(), items: z.number(), bytes: z.number() });

const ROOT_ROW = z.object({
  id: z.string(),
  scope: z.enum(['home', 'person']),
  owner_profile_id: z.string().nullable(),
  items: z.number(),
  folders: z.number(),
  bytes: z.number(),
});

const BYTES_ROW = z.object({ bytes: z.number() });

const MONTH_ROW = z.object({ month: z.string(), bytes: z.number() });

interface Purge {
  trashBytes: number;
  versionBytes: number;
}

export function paceBytesPerMonth(days: readonly DriveDay[]): number {
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) {
    return 0;
  }
  const elapsed = (Date.parse(last.day) - Date.parse(first.day)) / DAY_MS;
  return elapsed <= 0 ? 0 : ((last.bytes - first.bytes) / elapsed) * MONTH_DAYS;
}

interface Span {
  readonly first: string;
  readonly latest: string;
}

function spanOf(series: readonly (readonly DriveDay[])[]): Span | null {
  const days = series.flat().map((row) => row.day);
  if (days.length === 0) {
    return null;
  }
  return {
    first: days.reduce((a, b) => (a < b ? a : b)),
    latest: days.reduce((a, b) => (a > b ? a : b)),
  };
}

function historyOf(series: readonly (readonly DriveDay[])[]): Span | null {
  const span = spanOf(series);
  return span !== null && driveHistoryShown(span.first, span.latest) ? span : null;
}

export function fullInMonths(
  series: readonly (readonly DriveDay[])[],
  freeBytes: number,
): number | null {
  if (historyOf(series) === null) {
    return null;
  }
  const pace = series.reduce((sum, days) => sum + paceBytesPerMonth(days), 0);
  return pace <= 0 ? null : freeBytes / pace;
}

interface Snapshot {
  readonly items: number;
  readonly bytes: number;
}

export function growthOf(series: readonly (readonly DriveDay[])[]): DriveStats['growth'] {
  if (historyOf(series) === null) {
    return null;
  }
  const rows = series.flat().toSorted((a, b) => a.day.localeCompare(b.day));
  const current = new Map<string, Snapshot>();
  const out: NonNullable<DriveStats['growth']>[number][] = [];
  let added = 0;
  let removed = 0;
  for (const [index, row] of rows.entries()) {
    current.set(row.rootId, { items: row.items, bytes: row.bytes });
    added += row.added;
    removed += row.removed;
    if (rows[index + 1]?.day !== row.day) {
      const snapshots = [...current.values()];
      out.push({
        day: row.day,
        items: snapshots.reduce((sum, one) => sum + one.items, 0),
        bytes: snapshots.reduce((sum, one) => sum + one.bytes, 0),
        added,
        removed,
      });
      added = 0;
      removed = 0;
    }
  }
  return out;
}

function nextMonth(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  return number === 12
    ? `${String(year + 1).padStart(4, '0')}-01`
    : `${String(year).padStart(4, '0')}-${String(number + 1).padStart(2, '0')}`;
}

export function purgesOf(
  trash: readonly { month: string; bytes: number }[],
  versions: readonly { month: string; bytes: number }[],
  currentMonth: string,
): DriveStats['purges'] {
  const months = new Map<string, Purge>();
  const add = (month: string, bytes: number, key: keyof Purge): void => {
    const at = month < currentMonth ? currentMonth : month;
    const purge = months.get(at) ?? { trashBytes: 0, versionBytes: 0 };
    purge[key] += bytes;
    months.set(at, purge);
  };
  for (const row of trash) add(row.month, row.bytes, 'trashBytes');
  for (const row of versions) add(row.month, row.bytes, 'versionBytes');
  const last = [...months.keys()].reduce((a, b) => (a > b ? a : b), currentMonth);
  if (months.size === 0) {
    return [];
  }
  const out: DriveStats['purges'][number][] = [];
  for (let month = currentMonth; month <= last; month = nextMonth(month)) {
    out.push({ month, ...(months.get(month) ?? { trashBytes: 0, versionBytes: 0 }) });
  }
  return out;
}

export class DriveStatsReader {
  private readonly days: DriveDaysRepository;

  constructor(private readonly context: StoreContext) {
    this.days = new DriveDaysRepository(context);
  }

  async read(actor: DriveActor, probe: () => Promise<DriveDataSpace>): Promise<DriveStats> {
    const roots = this.openable(actor);
    const ids = roots.map((root) => root.id);
    const series = new Map(
      roots.map((root) => [root.id, this.days.range(root.id, FIRST_DAY, LAST_DAY)]),
    );
    const liveBytes = roots.reduce((sum, root) => sum + root.bytes, 0);
    const versionBytes = this.versionBytes(ids);
    const trashBytes = this.trashBytes(ids);
    const space = await probe();
    return DRIVE_STATS.parse({
      items: roots.reduce((sum, root) => sum + root.items, 0),
      folders: roots.reduce((sum, root) => sum + root.folders, 0),
      bytes: liveBytes + versionBytes + trashBytes,
      liveBytes,
      versionBytes,
      trashBytes,
      kinds: this.kinds(ids),
      roots: roots.map((root) => ({
        rootId: root.id,
        items: root.items,
        folders: root.folders,
        bytes: root.bytes,
      })),
      space,
      fullInMonths: fullInMonths([...series.values()], space.freeBytes),
      purges: this.purges(ids),
      growth: growthOf([...series.values()]),
    });
  }

  private openable(actor: DriveActor): z.output<typeof ROOT_ROW>[] {
    const filter = driveFilter(actor);
    return this.context.sql.all(
      ROOT_ROW,
      `select r.id, r.scope, r.owner_profile_id, r.items, r.folders, r.bytes from drive_roots r
        where ${filter.text} order by r.scope, r.owner_profile_id, r.id`,
      filter.parameters,
    );
  }

  private kinds(ids: readonly string[]): DriveStats['kinds'] {
    const filter = inList('root_id', 'roots', ids);
    const rows = this.context.sql.all(
      KIND_ROW,
      `select kind, count(*) as items, coalesce(sum(bytes), 0) as bytes from drive_items
        where kind <> 'folder' and ${filter.text} group by kind`,
      filter.parameters,
    );
    return SMART_RULE_ITEM_KINDS.map((kind) => {
      const row = rows.find((one) => one.kind === kind);
      return { kind, items: row?.items ?? 0, bytes: row?.bytes ?? 0 };
    });
  }

  private versionBytes(ids: readonly string[]): number {
    const filter = inList('root_id', 'roots', ids);
    return (
      this.context.sql.get(
        BYTES_ROW,
        `select coalesce(sum(bytes), 0) as bytes from (
          select max(bytes) as bytes from drive_versions where ${filter.text}
          group by root_id, sha256)`,
        filter.parameters,
      )?.bytes ?? 0
    );
  }

  private trashBytes(ids: readonly string[]): number {
    const filter = inList('root_id', 'roots', ids);
    return (
      this.context.sql.get(
        BYTES_ROW,
        `select coalesce(sum(bytes), 0) as bytes from drive_trash where ${filter.text}`,
        filter.parameters,
      )?.bytes ?? 0
    );
  }

  private purges(ids: readonly string[]): DriveStats['purges'] {
    const filter = inList('root_id', 'roots', ids);
    const trash = this.context.sql.all(
      MONTH_ROW,
      `select substr(purge_at, 1, 7) as month, sum(bytes) as bytes from drive_trash
        where ${filter.text} group by month`,
      filter.parameters,
    );
    const versions = this.context.sql.all(
      MONTH_ROW,
      `select substr(max(purge_at), 1, 7) as month, max(bytes) as bytes from drive_versions
        where ${filter.text} group by root_id, sha256`,
      filter.parameters,
    );
    return purgesOf(trash, versions, this.context.now().slice(0, 7));
  }
}
