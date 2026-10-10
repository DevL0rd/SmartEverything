import { PROVIDER_PHASES, PROVIDER_PROBLEMS } from '@smarteverything/domain';

function oneOf(column: string, values: readonly string[]): string {
  const listed = values.map((value) => `'${value}'`).join(', ');
  return `alter table provider_links add column ${column} text check (${column} is null or ${column} in (${listed}))`;
}

export const PROVIDER_PROGRESS_COLUMNS: readonly string[] = [
  oneOf('phase', PROVIDER_PHASES),
  oneOf('problem', PROVIDER_PROBLEMS),
];
