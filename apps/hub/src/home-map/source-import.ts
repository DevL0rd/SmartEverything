import {
  ApiError,
  type HomeMap,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapSource,
  type HomeMapSourceGeometry,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
import { alignFrameCheck, alignedNoticeOps, twoPointAlign } from './merge/align';
import { planImport, type FrameCheck, type ImportPlan } from './merge/pipeline';
import { rectifyScene, type RectifiedRoom, type RectifyTransform } from './merge/rectify';
import { noticeOps, type NoticeAction } from './notice-actions';
import { withLinkedRooms } from './room-links';
import type {
  MapSource,
  MapSourceKind,
  MapSourceRegistry,
  SourceInventory,
} from './sources/registry';
import type { HomeMapService } from './service';

export interface ImportRequest {
  readonly kind: MapSourceKind;
  readonly deviceId: string;
  readonly floorId?: string | undefined;
}

export type ImportStatus = 'imported' | 'unchanged' | 'pending';

export interface ImportOutcome {
  readonly revision: number;
  readonly status: ImportStatus;
}

export interface AlignPoint {
  readonly x: number;
  readonly y: number;
}

export type AlignRequest =
  | { readonly transform: RectifyTransform }
  | {
      readonly points: readonly [
        { readonly source: AlignPoint; readonly house: AlignPoint },
        { readonly source: AlignPoint; readonly house: AlignPoint },
      ];
    };

export interface SourceImportPorts {
  readonly registry: Pick<MapSourceRegistry, 'get' | 'candidates'>;
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly inventory: () => SourceInventory;
  readonly links: { readonly list: (deviceId: string) => readonly StoredRoomLink[] };
  readonly syncLinks: (deviceId: string) => number;
  readonly newId: () => string;
  readonly now: () => string;
  readonly log: Logger;
}

const TRANSFORM = z.strictObject({
  rotationDeg: z.number(),
  tx: z.number(),
  ty: z.number(),
  mirrored: z.boolean(),
});

const sourceOf = (map: HomeMap, deviceId: string): HomeMapSource | undefined =>
  map.sources.find((entry) => entry.deviceId === deviceId);

export class HomeMapSourceImports {
  private readonly watched = new Map<string, () => void>();

  constructor(private readonly ports: SourceImportPorts) {}

  watch(inventory: SourceInventory): void {
    const candidates = this.ports.registry.candidates(inventory);
    const present = new Set(candidates.map((entry) => `${entry.source.kind}:${entry.deviceId}`));
    for (const [key, release] of this.watched) {
      if (present.has(key)) continue;
      release();
      this.watched.delete(key);
    }
    for (const { source, deviceId } of candidates) {
      const key = `${source.kind}:${deviceId}`;
      if (this.watched.has(key)) continue;
      this.watched.set(
        key,
        source.onChange(deviceId, () => {
          this.followRobot(source.kind, deviceId);
        }),
      );
    }
  }

  stop(): void {
    for (const release of this.watched.values()) release();
    this.watched.clear();
  }

  importSource(request: ImportRequest, mapId?: HomeMapId): ImportOutcome {
    const source = this.sourceFor(request);
    const pending = this.pendingOutcome(source, request.deviceId, mapId);
    if (pending !== null) return pending;
    const geometry = source.read(request.deviceId);
    if (geometry === null) return this.outcome('pending', mapId);
    return this.merge(source, request, geometry, mapId);
  }

  align(sourceId: string, request: AlignRequest, actor: HomeMapActor, mapId?: HomeMapId): number {
    const map = this.ports.maps.get(mapId);
    const held = map.sources.find((entry) => entry.id === sourceId);
    if (held === undefined) throw new ApiError('not_found', 'The map has no such robot source.');
    const transform = this.transformOf(held, request);
    const geometry = this.geometryOf(held);
    const verdict: FrameCheck = () => ({
      kind: 'realign',
      transform,
      ops: alignedNoticeOps(map.notices, held.id),
    });
    const plan = planImport({
      map,
      geometry,
      sourceKind: held.kind,
      sourceId: held.id,
      deviceId: held.deviceId,
      floorId: held.floorId,
      importedAt: this.ports.now(),
      newId: this.ports.newId,
      frameCheck: verdict,
    });
    if (plan.kind !== 'noop') this.ports.maps.apply(plan.ops, actor, {}, mapId);
    return this.ports.maps.get(mapId).revision;
  }

  resolveNotice(
    noticeId: string,
    action: NoticeAction,
    actor: HomeMapActor,
    mapId?: HomeMapId,
  ): number {
    const map = this.ports.maps.get(mapId);
    const notice = map.notices.find((entry) => entry.id === noticeId);
    if (notice === undefined) throw new ApiError('not_found', 'The map has no such notice.');
    const ops = noticeOps({
      map,
      notice,
      action,
      robotRooms: () => this.robotRooms(map, notice.elementId),
      newId: this.ports.newId,
    });
    return this.ports.maps.apply(ops, actor, {}, mapId).revision;
  }

  private followRobot(kind: MapSourceKind, deviceId: string): void {
    if (sourceOf(this.ports.maps.get(), deviceId) === undefined) return;
    try {
      this.importSource({ kind, deviceId });
    } catch (error) {
      this.ports.log.error('home_map.source_import_failed', { deviceId, error: String(error) });
    }
  }

  private sourceFor(request: ImportRequest): MapSource {
    const source = this.ports.registry.get(request.kind);
    if (source === undefined) {
      throw new ApiError('invalid_request', `There is no ${request.kind} map source.`);
    }
    if (!source.devicesOf(this.ports.inventory()).includes(request.deviceId)) {
      throw new ApiError('not_found', 'That device has no map this source can read.');
    }
    return source;
  }

  private pendingOutcome(
    source: MapSource,
    deviceId: string,
    mapId: HomeMapId | undefined,
  ): ImportOutcome | null {
    if (source.isSettled(deviceId)) return null;
    this.ports.log.info('home_map.import_pending', { deviceId });
    return this.outcome('pending', mapId);
  }

  private outcome(status: ImportStatus, mapId: HomeMapId | undefined): ImportOutcome {
    return { revision: this.ports.maps.get(mapId).revision, status };
  }

  private merge(
    source: MapSource,
    request: ImportRequest,
    geometry: HomeMapSourceGeometry,
    mapId: HomeMapId | undefined,
  ): ImportOutcome {
    const map = this.ports.maps.get(mapId);
    const held = sourceOf(map, request.deviceId);
    if (held !== undefined && request.floorId !== undefined && request.floorId !== held.floorId) {
      throw new ApiError('conflict', `This robot is already imported on floor ${held.floorId}.`);
    }
    const plan = planImport({
      map,
      geometry,
      sourceKind: source.kind,
      sourceId: held?.id ?? this.ports.newId(),
      deviceId: request.deviceId,
      floorId: held?.floorId ?? request.floorId ?? this.ports.newId(),
      importedAt: this.ports.now(),
      newId: this.ports.newId,
      frameCheck: alignFrameCheck,
    });
    return plan.kind === 'noop'
      ? this.outcome('unchanged', mapId)
      : this.write(plan, request.deviceId, mapId);
  }

  private write(
    plan: Exclude<ImportPlan, { readonly kind: 'noop' }>,
    deviceId: string,
    mapId: HomeMapId | undefined,
  ): ImportOutcome {
    const ops =
      plan.kind === 'first' ? withLinkedRooms(plan.ops, this.ports.links.list(deviceId)) : plan.ops;
    const result = this.ports.maps.apply(ops, plan.actor, {}, mapId);
    this.ports.syncLinks(deviceId);
    return this.outcome(
      plan.kind !== 'refused' && result.applied.length > 0 ? 'imported' : 'unchanged',
      mapId,
    );
  }

  private transformOf(held: HomeMapSource, request: AlignRequest): RectifyTransform {
    if ('transform' in request) return TRANSFORM.parse(request.transform);
    const [first, second] = request.points;
    const fit = twoPointAlign(
      [
        { robot: first.source, house: first.house },
        { robot: second.source, house: second.house },
      ],
      held.transform.mirrored,
    );
    if (fit === null) {
      throw new ApiError('invalid_request', 'The two points must be apart on the robot map.');
    }
    return fit.transform;
  }

  private geometryOf(held: HomeMapSource): HomeMapSourceGeometry {
    const geometry = this.ports.registry.get(held.kind)?.read(held.deviceId) ?? null;
    if (geometry === null) {
      throw new ApiError('conflict', 'The robot has no published map to align yet.');
    }
    return geometry;
  }

  private robotRooms(map: HomeMap, elementId: string): readonly RectifiedRoom[] {
    const source = map.sources.find((entry) =>
      map.floors.some((floor) =>
        floor.rooms.some(
          (room) =>
            room.id === elementId &&
            room.origin.kind === 'source' &&
            room.origin.sourceId === entry.id,
        ),
      ),
    );
    if (source === undefined) {
      throw new ApiError('conflict', 'This room does not come from a robot map.');
    }
    return rectifyScene(this.geometryOf(source), source.transform).rooms;
  }
}
