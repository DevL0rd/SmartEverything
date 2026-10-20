import type { IconName } from '../../../components/icon';
import { joinParts } from '../../../format/text';

export const BAND_INSET = 26;

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

export interface RoomLive {
  readonly devices: number;
  readonly on: number;
  readonly offline: number;
  readonly lightsOn: number;
}

export function roomStatusLine(live: RoomLive): string {
  return joinParts([
    live.on === 0 ? 'All off' : `${String(live.on)} of ${String(live.devices)} on`,
    live.offline > 0 && `${String(live.offline)} offline`,
  ]);
}
