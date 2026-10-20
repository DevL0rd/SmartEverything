import { z } from 'zod';
import type { Sql } from './sql';

export const AUTOMATION_STORAGE_TABLES = [
  'automation_runs',
  'automation_run_nodes',
  'automation_decisions',
  'automation_node_state',
  'automation_questions',
  'automation_tests',
  'automation_plans',
  'automation_revisions',
  'automation_functions',
  'automation_function_revisions',
] as const;

export interface AutomationTableStorage {
  readonly table: (typeof AUTOMATION_STORAGE_TABLES)[number];
  readonly rows: number;
  readonly bytes: number;
}

const COLUMN = z.strictObject({ name: z.string(), type: z.string() }).loose();
const TOTALS = z.strictObject({ rows: z.int(), bytes: z.int() });
const INTEGER_BYTES = 8;

function bytesExpression(columns: readonly z.infer<typeof COLUMN>[]): string {
  const parts = columns.map((column) =>
    column.type.toUpperCase() === 'TEXT'
      ? `coalesce(length(cast("${column.name}" as blob)), 0)`
      : String(INTEGER_BYTES),
  );
  return parts.length === 0 ? '0' : parts.join(' + ');
}

export function automationStorageMetrics(sql: Sql): AutomationTableStorage[] {
  return AUTOMATION_STORAGE_TABLES.map((table) => {
    const columns = sql.all(COLUMN, `select name, type from pragma_table_info('${table}')`);
    const totals = sql.get(
      TOTALS,
      `select count(*) as rows, coalesce(sum(${bytesExpression(columns)}), 0) as bytes from ${table}`,
    );
    return { table, rows: totals?.rows ?? 0, bytes: totals?.bytes ?? 0 };
  });
}
