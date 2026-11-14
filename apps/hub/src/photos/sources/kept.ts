import { z } from 'zod';
import { inList, type Sql } from '../../store/sql';

const NAME_ROW = z.strictObject({ name: z.string() });

const HASH_ROW = z.strictObject({ sha256: z.string() });

export function keptNames(
  sql: Sql,
  rootId: string,
  prefix: string,
  names: readonly string[],
): ReadonlySet<string> {
  if (names.length === 0) return new Set();
  const filter = inList('name', 'names', names);
  return new Set(
    sql
      .all(
        NAME_ROW,
        `select name from drive_items
          where root_id = $rootId and kind <> 'folder'
            and substr(rel_path, 1, $length) = $prefix and ${filter.text}`,
        { ...filter.parameters, rootId, prefix, length: prefix.length },
      )
      .map((row) => row.name),
  );
}

export function keptHashes(
  sql: Sql,
  profileId: string,
  hashes: readonly string[],
): ReadonlySet<string> {
  if (hashes.length === 0) return new Set();
  const filter = inList('i.sha256', 'hashes', [...new Set(hashes)]);
  return new Set(
    sql
      .all(
        HASH_ROW,
        `select distinct i.sha256 from drive_items i join drive_roots r on r.id = i.root_id
          where ${filter.text} and i.kind <> 'folder' and i.integrity = 'ok'
            and (r.scope = 'home' or r.owner_profile_id = $profileId)`,
        { ...filter.parameters, profileId },
      )
      .map((row) => row.sha256),
  );
}
