import type { IconName } from './icon';

const ROOM_ICONS: readonly (readonly [RegExp, IconName])[] = [
  [/\b(bed|sleep|nursery|guest)/i, 'bed'],
  [/\b(living|lounge|sitting|family)/i, 'sofa'],
  [/\b(kitchen|dining|pantry)/i, 'utensils'],
  [/\b(bath|toilet|wc|shower|laundry)/i, 'bath'],
  [/\b(office|study|desk|work)/i, 'monitor'],
  [/\b(garage|car|driveway)/i, 'car'],
  [/\b(garden|patio|balcony|terrace|yard|outside)/i, 'leaf'],
  [/\b(gym|fitness)/i, 'dumbbell'],
  [/\b(kid|baby|play)/i, 'baby'],
  [/\b(game|media|cinema|theatre|tv)/i, 'tv'],
  [/\b(hall|entry|porch|door|stair)/i, 'door'],
];

export function roomIconOf(name: string): IconName {
  return ROOM_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'home';
}
