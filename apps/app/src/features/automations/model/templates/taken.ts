import type { Template } from './parameters';

export interface TakenRow {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface TakenIdea {
  readonly id: string;
  readonly enabled: boolean;
}

function lower(name: string): string {
  return name.toLowerCase();
}

export function unusedTemplates(
  templates: readonly Template[],
  takenNames: readonly string[],
): Template[] {
  const taken = new Set(takenNames.map(lower));
  return templates.filter((entry) => !taken.has(lower(entry.name)));
}

export function takenStates(
  templates: readonly Template[],
  rows: readonly TakenRow[],
): readonly (TakenIdea | null)[] {
  const byName = new Map(rows.map((row) => [lower(row.name), row] as const));
  return templates.map((entry) => {
    const found = byName.get(lower(entry.name));
    return found === undefined ? null : { id: found.id, enabled: found.enabled };
  });
}
