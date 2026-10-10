import type { Migration } from './index';

export const RESERVED_MIGRATION_VERSIONS: readonly number[] = [37];

class MigrationOrderError extends Error {
  override readonly name = 'MigrationOrderError';
}

function reservedBetween(from: number, to: number, reserved: readonly number[]): boolean {
  const skipped = Array.from({ length: to - from - 1 }, (_, index) => from + 1 + index);
  return skipped.every((version) => reserved.includes(version));
}

export function inOrder(
  migrations: readonly Migration[],
  reserved: readonly number[],
): readonly Migration[] {
  let previous = 0;
  for (const migration of migrations) {
    if (reserved.includes(migration.version)) {
      throw new MigrationOrderError(
        `Migration ${String(migration.version)} (${migration.name}) uses a reserved number; databases already past it would skip it silently, so take the next free number.`,
      );
    }
    if (migration.version <= previous || !reservedBetween(previous, migration.version, reserved)) {
      throw new MigrationOrderError(
        `Migration ${String(migration.version)} (${migration.name}) does not follow ${String(previous)} without gaps; only the reserved numbers ${reserved.join(', ')} may be skipped.`,
      );
    }
    previous = migration.version;
  }
  return migrations;
}
