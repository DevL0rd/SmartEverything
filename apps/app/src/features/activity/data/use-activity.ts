import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { commandAtom, eventAtom, type ActivityAtom, type ActivityCategory } from '../model/atoms';
import { coalesce, reuseItems, type ActivityItem } from '../model/coalesce';

export interface ActivityFilter {
  readonly deviceId?: string;
  readonly deviceIds?: ReadonlySet<string>;
}

const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  'devices',
  'cameras',
  'automations',
  'assistants',
];

export const CATEGORY_LABELS: Readonly<Record<ActivityCategory, string>> = {
  devices: 'Devices',
  cameras: 'Cameras',
  automations: 'Automations',
  assistants: 'Assistants',
};

function present(atom: ActivityAtom | null): atom is ActivityAtom {
  return atom !== null;
}

const activityInputs = (state: StoreState): readonly unknown[] => [
  state.tables.events,
  state.tables.commands,
  state.tables.devices,
];

function activityOf(
  state: StoreState,
  deviceId: string | undefined,
  deviceIds: ReadonlySet<string> | undefined,
): readonly ActivityItem[] {
  const devices = new Map(rowsOf(state.tables.devices).map((device) => [device.id, device]));
  const atoms = [
    ...rowsOf(state.tables.events).map((event) => eventAtom(event, devices)),
    ...rowsOf(state.tables.commands).map((command) => commandAtom(command, devices)),
  ]
    .filter(present)
    .filter((atom) => deviceId === undefined || atom.deviceId === deviceId)
    .filter(
      (atom) => deviceIds === undefined || (atom.deviceId !== null && deviceIds.has(atom.deviceId)),
    );
  return coalesce(atoms);
}

const ACTIVITY_SELECTORS = new Map<string, (state: StoreState) => readonly ActivityItem[]>();

function activitySelector(
  deviceId: string | undefined,
  deviceIds: ReadonlySet<string> | undefined,
): (state: StoreState) => readonly ActivityItem[] {
  const key = `${deviceId === undefined ? '*' : `=${deviceId}`}|${deviceIds === undefined ? '' : [...deviceIds].join(',')}`;
  const known = ACTIVITY_SELECTORS.get(key);
  if (known !== undefined) {
    return known;
  }
  let shown: readonly ActivityItem[] = [];
  const selector = memoOnInputs(activityInputs, (state) => {
    shown = reuseItems(shown, activityOf(state, deviceId, deviceIds));
    return shown;
  });
  ACTIVITY_SELECTORS.set(key, selector);
  return selector;
}

export function useActivity(filter: ActivityFilter = {}): readonly ActivityItem[] {
  return useStoreSelector(activitySelector(filter.deviceId, filter.deviceIds));
}

export function categoriesOf(items: readonly ActivityItem[]): readonly ActivityCategory[] {
  const found = new Set(items.map((item) => item.category));
  return ACTIVITY_CATEGORIES.filter((category) => found.has(category));
}
