import type { HomeMapId } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredRoomLink } from '../store/repositories/vacuum-room-links';
import { withRobotMap } from './feed-ops';
import { alignFrameCheck } from './merge/align';
import { planImport } from './merge/pipeline';
import { withLinkedRooms } from './room-links';
import type { MapSourceRegistry, SourceCandidate, SourceInventory } from './sources/registry';
import type { RobotMapIdentity } from './sources/xiaomi-vacuum';
import type { HomeMapService } from './service';

export interface AutoCreatePorts {
  readonly registry: Pick<MapSourceRegistry, 'candidates'>;
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly sets: { readonly ids: () => readonly HomeMapId[] };
  readonly currentMap: (deviceId: string) => RobotMapIdentity | null;
  readonly links: { readonly list: (deviceId: string) => readonly StoredRoomLink[] };
  readonly newId: () => string;
  readonly now: () => string;
  readonly log: Logger;
}

export type AutoCreateOutcome =
  'created' | 'map_exists' | 'not_settled' | 'no_published_map' | 'no_rooms' | 'failed';

const keyOf = (candidate: SourceCandidate): string =>
  `${candidate.source.kind}:${candidate.deviceId}`;

export class HomeMapAutoCreate {
  private readonly watched = new Map<string, () => void>();

  constructor(private readonly ports: AutoCreatePorts) {}

  watch(inventory: SourceInventory): void {
    const candidates = this.ports.registry.candidates(inventory);
    const present = new Set(candidates.map(keyOf));
    for (const [key, release] of this.watched) {
      if (present.has(key)) continue;
      release();
      this.watched.delete(key);
    }
    for (const candidate of candidates) {
      const key = keyOf(candidate);
      if (this.watched.has(key)) continue;
      this.watched.set(
        key,
        candidate.source.onChange(candidate.deviceId, () => {
          this.consider(candidate);
        }),
      );
      this.consider(candidate);
    }
  }

  stop(): void {
    for (const release of this.watched.values()) release();
    this.watched.clear();
  }

  consider(candidate: SourceCandidate): AutoCreateOutcome {
    try {
      return this.create(candidate);
    } catch (error) {
      this.ports.log.error('home_map.auto_create_failed', {
        deviceId: candidate.deviceId,
        error: String(error),
      });
      return 'failed';
    }
  }

  private create({ source, deviceId }: SourceCandidate): AutoCreateOutcome {
    if (this.ports.sets.ids().length > 0) return 'map_exists';
    if (!source.isSettled(deviceId)) return 'not_settled';
    const geometry = source.read(deviceId);
    if (geometry === null) return 'no_published_map';
    if (geometry.rooms.length === 0) return 'no_rooms';
    const sourceId = this.ports.newId();
    const plan = planImport({
      map: this.ports.maps.get(),
      geometry,
      sourceKind: source.kind,
      sourceId,
      deviceId,
      floorId: this.ports.newId(),
      importedAt: this.ports.now(),
      newId: this.ports.newId,
      frameCheck: alignFrameCheck,
    });
    if (plan.kind !== 'first') {
      this.ports.log.error('home_map.auto_create_unexpected_plan', { deviceId, plan: plan.kind });
      return 'failed';
    }
    const ops = withRobotMap(
      withLinkedRooms(plan.ops, this.ports.links.list(deviceId)),
      this.ports.currentMap(deviceId),
    );
    const result = this.ports.maps.apply(ops, plan.actor);
    if (result.applied.length === 0) {
      this.ports.log.warn('home_map.auto_create_refused', {
        deviceId,
        conflicts: result.conflicts.length,
      });
      return 'failed';
    }
    this.ports.log.info('home_map.auto_created', {
      deviceId,
      sourceId,
      revision: result.revision,
      rooms: geometry.rooms.length,
      skipped: plan.skipped.length,
    });
    return 'created';
  }
}
