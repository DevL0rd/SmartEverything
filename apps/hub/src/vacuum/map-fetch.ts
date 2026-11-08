import {
  VACUUM_SCENE,
  type JsonValue,
  type VacuumSavedMap,
  type VacuumScene,
  type VacuumSlot,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  MapBlobError,
  XiaomiCloudError,
  applyRoute,
  buildVacuumScene,
  buildWallsLayer,
  decodeMapLayer,
  decodeMapRoute,
  decryptMapBlob,
  type MapDocument,
  type PushedMapObjects,
  type Route,
} from '@smarteverything/xiaomi';
import { z } from 'zod';
import { MapDownloadError, type MapCloud } from '../adapters/xiaomi/map-cloud';
import type { MapCache } from './map-cache';
import { SlotQueue, keyOf } from './slot-queue';
import { SavedMapsFeed, parseSavedMaps, parseText, type SavedMapList } from './saved-maps';

const INTERIM_PATH = '/v2/home/get_interim_file_url_pro';
const INTERIM_PLAIN_PATH = '/v2/home/get_interim_file_url';
const PRO_UNAVAILABLE_CODES: ReadonlySet<number> = new Set([-6, -8]);
const NULL_FILE = 'This is a null file';

export type MapStage = 'identity' | 'url' | 'download' | 'decode' | 'scene' | 'store';

export interface MapTarget {
  readonly deviceId: string;
  readonly slot: VacuumSlot;
  readonly index: number;
  readonly objName: string;
  readonly robotMapId?: number;
}

export interface MapIdentity {
  readonly model: string;
  readonly did: string;
}

export interface MapUnreadable {
  readonly deviceId: string;
  readonly slot: VacuumSlot;
  readonly index: number;
  readonly stage: MapStage;
  readonly robotMapId: number | null;
  readonly lastGood: { readonly index: number; readonly fetchedAt: string } | null;
}

export interface MapFetchPorts {
  readonly cloud: MapCloud;
  readonly cache: MapCache;
  readonly identity: (deviceId: string) => MapIdentity | null;
  readonly pushed: (deviceId: string) => PushedMapObjects;
  readonly published: (deviceId: string, scene: VacuumScene) => void;
  readonly savedMaps: (deviceId: string, maps: readonly VacuumSavedMap[]) => void;
  readonly task: (deviceId: string, taskId: number | null) => void;
  readonly route: (deviceId: string, route: Route | null) => void;
  readonly unreadable: (failure: MapUnreadable) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

const FILE_URL = z.looseObject({ url: z.string().min(1) });
const CURRENT_PUSH = z.looseObject({ index: z.number().int(), obj_name: z.string().min(1) });
const BACKUP_PUSH = z.looseObject({
  index: z.number().int(),
  backup_map_arr: z.array(
    z.looseObject({ obj_name: z.string().min(1), backup_id: z.number().int().optional() }),
  ),
});

class NoMapError extends Error {
  override readonly name = 'NoMapError';
}

class MapStageError extends Error {
  override readonly name = 'MapStageError';

  constructor(
    readonly stage: MapStage,
    readonly origin: unknown,
  ) {
    super(`The vacuum map failed at the ${stage} stage.`);
  }
}

async function at<T>(stage: MapStage, work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new MapStageError(stage, error);
  }
}

function isLoggable(error: unknown): error is Error {
  return (
    error instanceof XiaomiCloudError ||
    error instanceof MapBlobError ||
    error instanceof MapDownloadError
  );
}

function currentOf(decoded: unknown): { index: number; objName: string } | null {
  const parsed = CURRENT_PUSH.safeParse(decoded);
  return parsed.success ? { index: parsed.data.index, objName: parsed.data.obj_name } : null;
}

function backupOf(decoded: unknown): { index: number; objName: string } | null {
  const parsed = BACKUP_PUSH.safeParse(decoded);
  if (!parsed.success) return null;
  const newest = parsed.data.backup_map_arr.reduce<
    (typeof parsed.data.backup_map_arr)[number] | undefined
  >((best, entry) => ((entry.backup_id ?? -1) > (best?.backup_id ?? -2) ? entry : best), undefined);
  return newest === undefined ? null : { index: parsed.data.index, objName: newest.obj_name };
}

export type SingleSlot = Exclude<VacuumSlot, 'saved'>;

export function mapTargetOf(
  deviceId: string,
  slot: SingleSlot,
  value: JsonValue,
): MapTarget | null {
  const decoded = parseText(value);
  const found = slot === 'current' ? currentOf(decoded) : backupOf(decoded);
  return found === null ? null : { deviceId, slot, ...found };
}

function isNullFile(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, NULL_FILE.length)).toString('utf8') === NULL_FILE;
}

export class MapFetcher {
  private readonly queues = new Map<string, SlotQueue>();
  private readonly saved: SavedMapsFeed;

  constructor(private readonly ports: MapFetchPorts) {
    this.saved = new SavedMapsFeed({
      cache: ports.cache,
      fetchObject: (deviceId, listIndex, objName, robotMapId): Promise<VacuumScene | null> =>
        this.fetchObject({ deviceId, slot: 'saved', index: listIndex, objName, robotMapId }),
      published: ports.published,
      summaries: ports.savedMaps,
      log: ports.log,
    });
  }

  observePush(deviceId: string, slot: VacuumSlot, value: JsonValue): Promise<void> {
    if (slot === 'saved') {
      const list = this.listOf(deviceId, value);
      return list === null ? Promise.resolve() : this.saved.submit(deviceId, list);
    }
    const target = this.targetOf(deviceId, slot, value);
    return target === null ? Promise.resolve() : this.observe(target);
  }

  notePush(deviceId: string, slot: VacuumSlot, value: JsonValue): void {
    if (slot === 'saved') {
      const list = this.listOf(deviceId, value);
      if (list !== null) this.saved.note(deviceId, list);
      return;
    }
    const target = this.targetOf(deviceId, slot, value);
    if (target !== null) this.queue(deviceId, slot).note(target);
  }

  observe(target: MapTarget): Promise<void> {
    return this.queue(target.deviceId, target.slot).submit(target, (next) => this.settle(next));
  }

  demand(deviceId: string, slot: VacuumSlot): Promise<void> {
    if (slot === 'saved') {
      const list = this.saved.noted(deviceId);
      return list === null ? Promise.resolve() : this.saved.submit(deviceId, list);
    }
    const noted = this.queue(deviceId, slot).lastNoted();
    if (noted === null) {
      this.ports.log.debug('vacuum_map.demand_without_index', { deviceId, slot });
      return Promise.resolve();
    }
    return this.observe(noted);
  }

  private targetOf(deviceId: string, slot: SingleSlot, value: JsonValue): MapTarget | null {
    return this.decoded(deviceId, slot, () => mapTargetOf(deviceId, slot, value));
  }

  private listOf(deviceId: string, value: JsonValue): SavedMapList | null {
    return this.decoded(deviceId, 'saved', () => parseSavedMaps(parseText(value)));
  }

  private decoded<T>(deviceId: string, slot: VacuumSlot, read: () => T | null): T | null {
    try {
      const found = read();
      if (found === null) this.ports.log.debug('vacuum_map.push_without_map', { deviceId, slot });
      return found;
    } catch (error) {
      this.ports.log.warn('vacuum_map.push_unreadable', {
        deviceId,
        slot,
        reason: error instanceof Error ? error.name : typeof error,
      });
      return null;
    }
  }

  private queue(deviceId: string, slot: VacuumSlot): SlotQueue {
    const key = keyOf(deviceId, slot);
    const held = this.queues.get(key);
    if (held !== undefined) return held;
    const created = new SlotQueue();
    this.queues.set(key, created);
    return created;
  }

  private async settle(target: MapTarget): Promise<void> {
    const scene =
      this.ports.cache.at(target.deviceId, target.slot, target.index) ??
      (await this.attempt(target));
    if (scene !== null) this.publish(target, scene);
  }

  private attempt(target: MapTarget): Promise<VacuumScene | null> {
    return this.guarded(target, async () => {
      const scene = await this.build(target);
      await at('store', () => {
        this.ports.cache.save(target.deviceId, scene);
      });
      return scene;
    });
  }

  private fetchObject(target: MapTarget): Promise<VacuumScene | null> {
    return this.guarded(target, () => this.build(target));
  }

  private async guarded(
    target: MapTarget,
    work: () => Promise<VacuumScene>,
  ): Promise<VacuumScene | null> {
    try {
      return await work();
    } catch (error) {
      this.failed(target, error);
      return null;
    }
  }

  private publish(target: MapTarget, scene: VacuumScene): void {
    if (this.queue(target.deviceId, target.slot).claimPublication(scene.index)) {
      this.ports.published(target.deviceId, scene);
    }
  }

  private async build(target: MapTarget): Promise<VacuumScene> {
    const { log, now } = this.ports;
    const identity = await at('identity', () => this.identityOf(target.deviceId));
    log.info('vacuum_map.fetch_started', {
      deviceId: target.deviceId,
      slot: target.slot,
      index: target.index,
    });
    const bytes = await this.blob(target);
    log.info('vacuum_map.blob_received', {
      deviceId: target.deviceId,
      slot: target.slot,
      index: target.index,
      bytes: bytes.length,
    });
    const map = await at('decode', () => this.mapOf(bytes, identity));
    const route = await at('decode', () => decodeMapRoute(map.paths));
    if (target.slot === 'current') {
      this.ports.task(target.deviceId, map.task_id ?? null);
      this.ports.route(target.deviceId, route);
    }
    return at('scene', () => this.sceneOf(target, map, route, now()));
  }

  private identityOf(deviceId: string): MapIdentity {
    const identity = this.ports.identity(deviceId);
    if (identity === null) throw new Error('no model and did known for the device');
    return identity;
  }

  private async blob(target: MapTarget): Promise<Uint8Array> {
    const url = await at('url', () => this.fileUrl(target));
    return at('download', () => this.ports.cloud.download(url));
  }

  private async fileUrl(target: MapTarget): Promise<string> {
    const body = { obj_name: target.objName };
    return FILE_URL.parse(await this.interim(target, body)).url;
  }

  private async interim(target: MapTarget, body: { obj_name: string }): Promise<JsonValue> {
    const { cloud, log } = this.ports;
    try {
      return await cloud.call(INTERIM_PATH, body);
    } catch (error) {
      if (!(error instanceof XiaomiCloudError) || !PRO_UNAVAILABLE_CODES.has(error.code)) {
        throw error;
      }
      log.info('vacuum_map.interim_pro_unavailable', {
        deviceId: target.deviceId,
        slot: target.slot,
        index: target.index,
        cloudCode: error.code,
      });
      return cloud.call(INTERIM_PLAIN_PATH, body);
    }
  }

  private mapOf(bytes: Uint8Array, identity: MapIdentity): MapDocument {
    if (isNullFile(bytes)) throw new NoMapError();
    return decryptMapBlob(bytes, identity.model, identity.did);
  }

  private sceneOf(
    target: MapTarget,
    map: MapDocument,
    route: Route | null,
    fetchedAt: Date,
  ): VacuumScene {
    const base = buildVacuumScene({
      map,
      index: target.index,
      slot: target.slot,
      fetchedAt: fetchedAt.toISOString(),
    });
    const layer = buildWallsLayer(
      map,
      decodeMapLayer(map, 'map_data'),
      this.ports.pushed(target.deviceId),
    );
    const own =
      target.slot === 'current' && map.map_id !== undefined ? { robotMapId: map.map_id } : {};
    return VACUUM_SCENE.parse(applyRoute({ ...base, ...own, ...layer }, route));
  }

  private failed(target: MapTarget, error: unknown): void {
    const { log, unreadable } = this.ports;
    const base = { deviceId: target.deviceId, slot: target.slot, index: target.index };
    const robotMapId = target.robotMapId ?? null;
    const { stage, origin } =
      error instanceof MapStageError ? error : new MapStageError('scene', error);
    if (origin instanceof NoMapError) {
      log.info('vacuum_map.no_map', base);
      return;
    }
    log.error('vacuum_map.fetch_failed', isLoggable(origin) ? origin : undefined, {
      ...base,
      stage,
      reason: origin instanceof Error ? origin.name : typeof origin,
    });
    if (stage !== 'decode' && stage !== 'scene') return;
    const held = this.lastGoodOf(target);
    unreadable({
      ...base,
      stage,
      robotMapId,
      lastGood: held === undefined ? null : { index: held.index, fetchedAt: held.fetchedAt },
    });
  }

  private lastGoodOf(target: MapTarget): VacuumScene | undefined {
    const { cache } = this.ports;
    return target.robotMapId === undefined
      ? cache.latest(target.deviceId, target.slot)
      : cache.robotMap(target.deviceId, target.robotMapId);
  }
}
