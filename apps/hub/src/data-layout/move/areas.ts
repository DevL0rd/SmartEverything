export const MOVE_AREAS = ['people', 'home', 'system', 'cache', 'backups'] as const;

export type MoveArea = (typeof MOVE_AREAS)[number];

const SKIPPED_SYSTEM_ENTRIES: ReadonlySet<string> = new Set(['database']);

function isArea(name: string | undefined): name is MoveArea {
  return MOVE_AREAS.some((area) => area === name);
}

export function areaOf(relPath: string): MoveArea | undefined {
  const [first, second] = relPath.split('/');
  if (!isArea(first)) {
    return undefined;
  }
  if (first === 'system' && second !== undefined && SKIPPED_SYSTEM_ENTRIES.has(second)) {
    return undefined;
  }
  return first;
}
