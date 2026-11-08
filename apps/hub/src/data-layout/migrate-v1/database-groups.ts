import { LEGACY_NAMES } from '../legacy';
import { V1_NAMES } from '../layout';
import type { NewStep } from './journal';

export interface DatabaseGroup {
  readonly base: string;
  readonly members: readonly string[];
}

const SIDECAR = /-(wal|shm)$/;
const COPY_SUFFIX = /\.(sqlite3?|db)$/;

function baseOf(name: string): string {
  return name.replace(SIDECAR, '');
}

export function isDatabaseEntry(name: string): boolean {
  const base = baseOf(name);
  return (
    base === LEGACY_NAMES.database.file ||
    base.startsWith(`${LEGACY_NAMES.database.file}.`) ||
    COPY_SUFFIX.test(base)
  );
}

export function groupDatabaseEntries(names: readonly string[]): readonly DatabaseGroup[] {
  const groups = new Map<string, string[]>();
  for (const name of [...names.filter(isDatabaseEntry)].sort()) {
    const base = baseOf(name);
    const members = groups.get(base) ?? [];
    members.push(name);
    groups.set(base, members);
  }
  return [...groups].map(([base, members]) => ({ base, members }));
}

function liveTargets(): ReadonlyMap<string, string> {
  const from = LEGACY_NAMES.database;
  const to = V1_NAMES.database;
  return new Map([
    [from.wal, to.wal],
    [from.shm, to.shm],
    [from.file, to.file],
  ]);
}

export function databaseSteps(groups: readonly DatabaseGroup[]): readonly NewStep[] {
  const live = liveTargets();
  const hasLiveBase = groups.some(
    (group) => group.base === LEGACY_NAMES.database.file && group.members.includes(group.base),
  );
  return groups.flatMap((group) =>
    group.members.map((name): NewStep => {
      const target = hasLiveBase ? live.get(name) : undefined;
      return {
        kind: 'rename',
        from: name,
        to: target ?? `${V1_NAMES.backups.legacyDatabase}/${name}`,
      };
    }),
  );
}
