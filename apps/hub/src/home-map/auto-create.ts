import { background, type Logger } from '@smarteverything/logging';
import { withRobotMap } from './feed-ops';
import { alignFrameCheck } from './merge/align';
import { planImport } from './merge/pipeline';
import { withLinkedRooms } from './room-links';
import type { MapSourceRegistry, SourceCandidate, SourceInventory } from './sources/registry';
import type { RobotMapIdentity } from './sources/xiaomi-vacuum';
import type { HomeMapRoomLinkStore } from './map-store';
import type { HeldMaps, HomeMapService } from './service';

export interface AutoCreatePorts {
  readonly registry: Pick<MapSourceRegistry, 'candidates'>;
  readonly maps: Pick<HomeMapService, 'exclusive'>;
  readonly currentMap: (deviceId: string) => RobotMapIdentity | null;
  readonly links: HomeMapRoomLinkStore;
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

  async watch(inventory: SourceInventory): Promise<void> {
    const candidates = this.ports.registry.candidates(inventory);
    const considered: Promise<AutoCreateOutcome>[] = [];
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
          background(this.consider(candidate), 'home_map.auto_create_failed', {
            deviceId: candidate.deviceId,
          });
        }),
      );
      considered.push(this.consider(candidate));
    }
    await Promise.all(considered);
  }

  stop(): void {
    for (const release of this.watched.values()) release();
    this.watched.clear();
  }

  async consider(candidate: SourceCandidate): Promise<AutoCreateOutcome> {
    try {
      return await this.ports.maps.exclusive((held) => this.create(held, candidate));
    } catch (error) {
      this.ports.log.error('home_map.auto_create_failed', {
        deviceId: candidate.deviceId,
        error: String(error),
      });
      return 'failed';
    }
  }

  private async create(
    held: HeldMaps,
    { source, deviceId }: SourceCandidate,
  ): Promise<AutoCreateOutcome> {
    if (held.ids().length > 0) return 'map_exists';
    if (!source.isSettled(deviceId)) return 'not_settled';
    const geometry = source.read(deviceId);
    if (geometry === null) return 'no_published_map';
    if (geometry.rooms.length === 0) return 'no_rooms';
    const sourceId = this.ports.newId();
    const plan = planImport({
      map: held.get(),
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
      withLinkedRooms(plan.ops, await this.ports.links.list(deviceId)),
      this.ports.currentMap(deviceId),
    );
    const result = await held.apply(ops, plan.actor);
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
