import type { VacuumAction, VacuumEvent, VacuumProperty, VacuumSafety } from './catalog-schema';

const NEVER_IN_TESTS_PROPERTIES: ReadonlySet<string> = new Set(['10.11', '21.6']);
const NEVER_IN_TESTS_ACTIONS: ReadonlySet<string> = new Set([
  '10.3',
  '15.1',
  '20.7',
  '20.9',
  '21.7',
]);
const READ_ONLY_ACTIONS: ReadonlySet<string> = new Set(['10.7']);
const GETTER_PREFIX = 'get-';

function address(siid: number, id: number): string {
  return `${String(siid)}.${String(id)}`;
}

export function propertySafety(property: VacuumProperty): VacuumSafety {
  return NEVER_IN_TESTS_PROPERTIES.has(address(property.siid, property.piid))
    ? 'never-in-tests'
    : 'read-only';
}

export function actionSafety(action: VacuumAction): VacuumSafety {
  if (action.destructive) {
    return 'destructive';
  }
  const where = address(action.siid, action.aiid);
  if (NEVER_IN_TESTS_ACTIONS.has(where)) {
    return 'never-in-tests';
  }
  if (action.name.startsWith(GETTER_PREFIX) || READ_ONLY_ACTIONS.has(where)) {
    return 'read-only';
  }
  return 'safe-physical';
}

export function vacuumSafety(entry: VacuumProperty | VacuumAction | VacuumEvent): VacuumSafety {
  switch (entry.kind) {
    case 'property':
      return propertySafety(entry);
    case 'action':
      return actionSafety(entry);
    case 'event':
      return 'read-only';
  }
}
