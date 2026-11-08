import { z } from 'zod';
import { STARTER_NODE_IDS } from '@smarteverything/domain';
import type { Sql } from '../../src/store/sql';

const HASH = z.object({ plan_hash: z.string() });

export const STARTER_IDS: readonly string[] = Object.values(STARTER_NODE_IDS);

export function removeStarterNodes(sql: Sql): void {
  const hashes = new Set<string>();
  for (const id of STARTER_IDS) {
    for (const row of sql.all(
      HASH,
      'select plan_hash from automation_function_revisions where function_id = $id',
      { id },
    )) {
      hashes.add(row.plan_hash);
    }
    sql.run(
      'remove the starter revisions',
      'delete from automation_function_revisions where function_id = $id',
      { id },
    );
    sql.run('remove the starter node', 'delete from automation_functions where id = $id', { id });
  }
  for (const hash of hashes) {
    sql.run('remove the starter plan', 'delete from automation_plans where hash = $hash', {
      hash,
    });
  }
}
