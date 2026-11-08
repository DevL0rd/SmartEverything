import type { HomeMapOpening } from './home-map-elements';

export const HOME_MAP_OPENING_STATES = ['closed', 'open', 'tilted', 'unknown'] as const;

export type HomeMapOpeningLiveState = (typeof HOME_MAP_OPENING_STATES)[number];

export interface HomeMapContactReading {
  readonly online: boolean;
  readonly open: boolean | null;
  readonly tilted?: boolean | null;
}

export type HomeMapContactReadings = ReadonlyMap<string, HomeMapContactReading>;

export type HomeMapOpeningStates = ReadonlyMap<string, HomeMapOpeningLiveState>;

export interface HomeMapOpeningChange {
  readonly id: string;
  readonly from: HomeMapOpeningLiveState;
  readonly to: HomeMapOpeningLiveState;
}

const readingState = (reading: HomeMapContactReading): HomeMapOpeningLiveState => {
  if (!reading.online) return 'unknown';
  if (reading.tilted === true) return 'tilted';
  if (reading.open === null) return 'unknown';
  return reading.open ? 'open' : 'closed';
};

export const openingLiveState = (
  opening: Pick<HomeMapOpening, 'contactDeviceId'>,
  readings: HomeMapContactReadings,
): HomeMapOpeningLiveState => {
  if (opening.contactDeviceId === null) return 'closed';
  const reading = readings.get(opening.contactDeviceId);
  return reading === undefined ? 'unknown' : readingState(reading);
};

export const openingLiveStates = (
  openings: readonly Pick<HomeMapOpening, 'id' | 'contactDeviceId'>[],
  readings: HomeMapContactReadings,
): HomeMapOpeningStates =>
  new Map(openings.map((opening) => [opening.id, openingLiveState(opening, readings)]));

export const openingChanges = (
  previous: HomeMapOpeningStates | null,
  next: HomeMapOpeningStates,
): readonly HomeMapOpeningChange[] => {
  if (previous === null) return [];
  const changes: HomeMapOpeningChange[] = [];
  for (const [id, to] of next) {
    const from = previous.get(id);
    if (from === undefined || from === to || from === 'unknown' || to === 'unknown') continue;
    changes.push({ id, from, to });
  }
  return changes;
};
