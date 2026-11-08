import {
  HOME_MAP_SCAN,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapRevisionEntry,
  type HomeMapScan,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export type RevisionSource = (mapId: HomeMapId, after: number) => HomeMapRevisionEntry[];

interface Stacks {
  readonly done: number[];
  readonly undone: number[];
}

interface Holder {
  readonly actor: HomeMapActor;
  readonly names: readonly string[];
}

class MapReach {
  seen = 0;
  unreadable = false;
  readonly holders = new Map<number, Holder>();
  private readonly actors = new Map<HomeMapActor, Stacks>();

  take(entry: HomeMapRevisionEntry, names: readonly string[] | null): void {
    const stacks = this.actors.get(entry.actor) ?? { done: [], undone: [] };
    replay(stacks, entry);
    this.actors.set(entry.actor, stacks);
    this.seen = entry.revision;
    if (names === null) this.unreadable = true;
    else if (names.length > 0) this.holders.set(entry.revision, { actor: entry.actor, names });
  }

  walkable(holder: Holder, revision: number): boolean {
    const stacks = this.actors.get(holder.actor);
    return (
      stacks !== undefined && (stacks.done.includes(revision) || stacks.undone.includes(revision))
    );
  }
}

export const scanFileNames = (scan: HomeMapScan): string[] => [
  `${scan.file.hash}.${scan.file.format}`,
  ...(scan.lod === null ? [] : [`${scan.lod.hash}.rad`]),
];

function cutAt(stack: number[], revision: number): void {
  const index = stack.lastIndexOf(revision);
  if (index >= 0) stack.splice(index);
}

function replay(stacks: Stacks, entry: HomeMapRevisionEntry): void {
  if (entry.undoes !== undefined) {
    cutAt(stacks.done, entry.undoes);
    stacks.undone.push(entry.revision);
  } else if (entry.redoes !== undefined) {
    cutAt(stacks.undone, entry.redoes);
    stacks.done.push(entry.revision);
  } else {
    stacks.done.push(entry.revision);
    stacks.undone.splice(0);
  }
}

export class ScanReach {
  private readonly maps = new Map<HomeMapId, MapReach>();

  constructor(
    private readonly source: RevisionSource,
    private readonly log: Logger,
  ) {}

  reachable(mapId: HomeMapId): ReadonlySet<string> | null {
    const reach = this.reachOf(mapId);
    for (const entry of this.source(mapId, reach.seen)) {
      const wasReadable = !reach.unreadable;
      reach.take(entry, this.namesOf(entry.inverse));
      if (wasReadable && reach.unreadable) {
        this.log.error('home_map.scan_history_unreadable', { mapId });
      }
    }
    if (reach.unreadable) return null;
    const names = new Set<string>();
    for (const [revision, holder] of reach.holders) {
      if (!reach.walkable(holder, revision)) {
        reach.holders.delete(revision);
        continue;
      }
      for (const name of holder.names) names.add(name);
    }
    return names;
  }

  forget(mapId: HomeMapId): void {
    this.maps.delete(mapId);
  }

  private reachOf(mapId: HomeMapId): MapReach {
    const held = this.maps.get(mapId);
    if (held !== undefined) return held;
    const created = new MapReach();
    this.maps.set(mapId, created);
    return created;
  }

  private namesOf(ops: readonly HomeMapOp[]): string[] | null {
    const names: string[] = [];
    for (const op of ops) {
      if (op.op !== 'setScan') continue;
      const parsed = HOME_MAP_SCAN.safeParse(op.scan);
      if (!parsed.success) return null;
      names.push(...scanFileNames(parsed.data));
    }
    return names;
  }
}
