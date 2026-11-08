import {
  vacuumSavedMapVersion,
  type JsonValue,
  type VacuumSavedMap,
  type VacuumScene,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { MapCache } from './map-cache';

export interface SavedMapEntry {
  readonly robotMapId: number;
  readonly name: string;
  readonly objName: string;
  readonly isCurrent: boolean;
}

export interface SavedMapList {
  readonly index: number;
  readonly maps: readonly SavedMapEntry[];
  readonly skipped: number;
}

export interface SavedMapsPorts {
  readonly cache: Pick<MapCache, 'saveRobotMap' | 'robotMap' | 'dropRobotMap'>;
  readonly fetchObject: (
    deviceId: string,
    listIndex: number,
    objName: string,
    robotMapId: number,
  ) => Promise<VacuumScene | null>;
  readonly published: (deviceId: string, scene: VacuumScene) => void;
  readonly summaries: (deviceId: string, maps: readonly VacuumSavedMap[]) => void;
  readonly log: Logger;
}

const LIST = z.looseObject({ index: z.number().int(), map_array: z.array(z.unknown()) });

const ENTRY = z.looseObject({
  map_name: z.string().optional(),
  obj_name: z.string().min(1),
  map_id: z.number().int(),
  temp: z.union([z.number(), z.boolean()]).optional(),
  is_current: z.boolean().optional(),
});

export function parseText(value: JsonValue): unknown {
  return typeof value === 'string' && value !== '' ? JSON.parse(value) : null;
}

function isTemporary(temp: number | boolean | undefined): boolean {
  return temp !== undefined && temp !== 0 && temp !== false;
}

export function parseSavedMaps(decoded: unknown): SavedMapList | null {
  const list = LIST.safeParse(decoded);
  if (!list.success) return null;
  const maps: SavedMapEntry[] = [];
  let skipped = 0;
  for (const raw of list.data.map_array) {
    const entry = ENTRY.safeParse(raw);
    if (!entry.success) skipped += 1;
    else if (!isTemporary(entry.data.temp)) {
      maps.push({
        robotMapId: entry.data.map_id,
        name: entry.data.map_name ?? '',
        objName: entry.data.obj_name,
        isCurrent: entry.data.is_current === true,
      });
    }
  }
  return { index: list.data.index, maps, skipped };
}

export function signatureOf(entry: SavedMapEntry, listIndex: number): string {
  const parts = [entry.objName, entry.name, String(entry.isCurrent)];
  return (entry.isCurrent ? [...parts, String(listIndex)] : parts).join('\u0000');
}

function withMap(scene: VacuumScene, entry: SavedMapEntry): VacuumScene {
  return {
    ...scene,
    name: entry.name === '' ? null : entry.name,
    robotMapId: entry.robotMapId,
    robotMapName: entry.name,
    isCurrent: entry.isCurrent,
  };
}

function summaryOf(entry: SavedMapEntry, scene: VacuumScene): VacuumSavedMap {
  return {
    robotMapId: entry.robotMapId,
    name: entry.name,
    isCurrent: entry.isCurrent,
    rooms: scene.rooms.length,
    version: vacuumSavedMapVersion({ index: scene.index, robotMapId: entry.robotMapId }),
  };
}

class DeviceFeed {
  private readonly known = new Map<number, string>();
  private running: Promise<void> | null = null;
  private pending: SavedMapList | null = null;
  private latest: SavedMapList | null = null;
  private summaryText: string | null = null;

  note(list: SavedMapList): void {
    this.latest = list;
  }

  noted(): SavedMapList | null {
    return this.latest;
  }

  submit(list: SavedMapList, settle: (list: SavedMapList) => Promise<void>): Promise<void> {
    this.latest = list;
    if (this.running !== null) {
      this.pending = list;
      return this.running;
    }
    this.running = this.drain(list, settle).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  changed(list: SavedMapList): readonly SavedMapEntry[] {
    return list.maps.filter(
      (entry) => this.known.get(entry.robotMapId) !== signatureOf(entry, list.index),
    );
  }

  remember(entry: SavedMapEntry, listIndex: number): void {
    this.known.set(entry.robotMapId, signatureOf(entry, listIndex));
  }

  removed(list: SavedMapList): readonly number[] {
    const present = new Set(list.maps.map((entry) => entry.robotMapId));
    const gone = [...this.known.keys()].filter((robotMapId) => !present.has(robotMapId));
    for (const robotMapId of gone) this.known.delete(robotMapId);
    return gone;
  }

  summaryChanged(text: string): boolean {
    if (this.summaryText === text) return false;
    this.summaryText = text;
    return true;
  }

  private async drain(
    first: SavedMapList,
    settle: (list: SavedMapList) => Promise<void>,
  ): Promise<void> {
    let next: SavedMapList | null = first;
    while (next !== null) {
      this.pending = null;
      await settle(next);
      next = this.pending;
    }
  }
}

interface Job {
  readonly deviceId: string;
  readonly listIndex: number;
  readonly entry: SavedMapEntry;
}

export class SavedMapsFeed {
  private readonly devices = new Map<string, DeviceFeed>();

  constructor(private readonly ports: SavedMapsPorts) {}

  note(deviceId: string, list: SavedMapList): void {
    this.deviceOf(deviceId).note(list);
  }

  noted(deviceId: string): SavedMapList | null {
    return this.devices.get(deviceId)?.noted() ?? null;
  }

  submit(deviceId: string, list: SavedMapList): Promise<void> {
    return this.deviceOf(deviceId).submit(list, (next) => this.settle(deviceId, next));
  }

  private deviceOf(deviceId: string): DeviceFeed {
    const held = this.devices.get(deviceId);
    if (held !== undefined) return held;
    const created = new DeviceFeed();
    this.devices.set(deviceId, created);
    return created;
  }

  private async settle(deviceId: string, list: SavedMapList): Promise<void> {
    const feed = this.deviceOf(deviceId);
    if (list.skipped > 0) {
      this.ports.log.warn('vacuum_map.saved_entries_skipped', { deviceId, skipped: list.skipped });
    }
    for (const robotMapId of feed.removed(list)) {
      this.ports.cache.dropRobotMap(deviceId, robotMapId);
      this.ports.log.info('vacuum_map.saved_map_removed', { deviceId, robotMapId });
    }
    const objects = new Map<string, Promise<VacuumScene | null>>();
    await Promise.all(
      feed.changed(list).map(async (entry) => {
        const object =
          objects.get(entry.objName) ??
          this.ports.fetchObject(deviceId, list.index, entry.objName, entry.robotMapId);
        objects.set(entry.objName, object);
        const base = await object;
        if (base !== null) this.keep(feed, { deviceId, listIndex: list.index, entry }, base);
      }),
    );
    this.summarise(deviceId, feed, list);
  }

  private keep(feed: DeviceFeed, job: Job, base: VacuumScene): void {
    const { deviceId, listIndex, entry } = job;
    const scene = withMap(base, entry);
    this.ports.cache.saveRobotMap(deviceId, scene);
    feed.remember(entry, listIndex);
    if (entry.isCurrent) this.ports.published(deviceId, scene);
    this.ports.log.info('vacuum_map.saved_map_fetched', {
      deviceId,
      robotMapId: entry.robotMapId,
      index: listIndex,
    });
  }

  private summarise(deviceId: string, feed: DeviceFeed, list: SavedMapList): void {
    const maps = list.maps.flatMap((entry) => {
      const scene = this.ports.cache.robotMap(deviceId, entry.robotMapId);
      return scene === undefined ? [] : [summaryOf(entry, scene)];
    });
    if (feed.summaryChanged(JSON.stringify(maps))) this.ports.summaries(deviceId, maps);
  }
}
