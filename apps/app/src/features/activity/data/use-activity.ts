import { useDevices, useRows } from '../../../store/selectors';
import { commandAtom, eventAtom, type ActivityAtom, type ActivityCategory } from '../model/atoms';
import { coalesce, type ActivityItem } from '../model/coalesce';

export interface ActivityFilter {
  readonly deviceId?: string;
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

export function useActivity(filter: ActivityFilter = {}): readonly ActivityItem[] {
  const events = useRows('events');
  const commands = useRows('commands');
  const devices = new Map(useDevices({ includeHidden: true }).map((device) => [device.id, device]));
  const atoms = [
    ...events.map((event) => eventAtom(event, devices)),
    ...commands.map((command) => commandAtom(command, devices)),
  ]
    .filter(present)
    .filter((atom) => filter.deviceId === undefined || atom.deviceId === filter.deviceId);
  return coalesce(atoms);
}

export function categoriesOf(items: readonly ActivityItem[]): readonly ActivityCategory[] {
  const found = new Set(items.map((item) => item.category));
  return ACTIVITY_CATEGORIES.filter((category) => found.has(category));
}
