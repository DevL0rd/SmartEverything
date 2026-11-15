import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { HubApi } from './api.ts';
import type { Counted } from './context.ts';

const MEDIA_TIMEOUT_MS = 600_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForMedia(api: HubApi, expectedLibrary: number): Promise<void> {
  const deadline = Date.now() + MEDIA_TIMEOUT_MS;
  for (;;) {
    const state = await api.call(E.readMediaProcessing);
    const rail = await api.call(E.readPhotoRailCounts);
    if (state.queued === 0 && state.running === 0 && rail.library >= expectedLibrary) return;
    if (Date.now() > deadline) throw new Error('The photo pipeline did not finish in time.');
    await sleep(2_000);
  }
}

function present<T>(rows: readonly T[] | undefined, table: string): readonly T[] {
  if (rows === undefined) throw new Error(`The snapshot has no ${table} table.`);
  return rows;
}

export async function countsOf(api: HubApi): Promise<Counted> {
  const snapshot = await api.call(E.readSnapshot, { query: {} });
  const tables = snapshot.tables;
  const rail = await api.call(E.readPhotoRailCounts);
  const memories = await api.call(E.listAiMemories);
  const chats = await api.call(E.listAiChats, { query: {} });
  const stats = await api.call(E.readDriveStats);
  const shares = await api.call(E.listShares, { query: {} });
  const placements = await api.call(E.listPlacements);
  const albums = await api.call(E.listAlbums, { query: { surface: 'photos' } });
  const map = await api.call(E.getHomeMap, { query: { view: 'full' } });
  return {
    profiles: tables.profiles.length,
    rooms: tables.rooms.length,
    devices: tables.devices.length,
    deviceStates: tables.device_state.length,
    cameras: tables.cameras.length,
    events: tables.events.length,
    healthDays: tables.health_daily.length,
    automations: tables.automations.length,
    scheduled: present(tables.scheduled_actions, 'scheduled_actions').length,
    plannerCollections: tables.planner_collections.length,
    plannerItems: tables.planner_items.length,
    plannerAlarms: tables.planner_alarms.length,
    driveRoots: present(tables.drive_roots, 'drive_roots').length,
    driveGrants: present(tables.drive_grants, 'drive_grants').length,
    driveItems: stats.items,
    driveFolders: stats.folders,
    driveBytes: stats.bytes,
    driveShares: shares.items.length,
    placements: placements.length,
    photos: rail.library,
    photoVideos: rail.videos,
    photoScreenshots: rail.screenshots,
    photoDuplicates: rail.duplicates,
    photoPlaces: rail.places,
    photoAlbums: albums.length,
    mapFloors: 'floors' in map ? map.floors.length : 0,
    mapRooms: 'floors' in map ? map.floors.reduce((sum, floor) => sum + floor.rooms.length, 0) : 0,
    plannerShares: tables.planner_collection_shares.length,
    plannerBookingPages: tables.planner_booking_pages.length,
    aiChats: chats.length,
    aiMemories: memories.memories.length,
  };
}
