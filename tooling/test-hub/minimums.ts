import type { Counted } from './context.ts';

export const MINIMUMS: Counted = {
  profiles: 3,
  rooms: 7,
  devices: 40,
  deviceStates: 100,
  cameras: 3,
  events: 100,
  healthDays: 90,
  automations: 12,
  scheduled: 4,
  plannerCollections: 15,
  plannerItems: 300,
  plannerAlarms: 9,
  driveRoots: 2,
  driveGrants: 3,
  driveItems: 200,
  driveShares: 2,
  placements: 3,
  photos: 200,
  photoVideos: 5,
  photoScreenshots: 5,
  photoDuplicates: 3,
  photoAlbums: 3,
  mapFloors: 1,
  mapRooms: 7,
  plannerShares: 4,
  plannerBookingPages: 1,
  aiChats: 5,
  aiMemories: 5,
};

export function shortfalls(counts: Counted): string[] {
  return Object.entries(MINIMUMS)
    .filter(([name, minimum]) => (counts[name] ?? 0) < minimum)
    .map(([name, minimum]) => `${name}: ${String(counts[name] ?? 0)} is below ${String(minimum)}`);
}
