import { appendTo, type PhotoGroupKind } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { assignIncremental, type ClusterGroup } from '../../vision/cluster';
import { FACE_MATCH_THRESHOLD } from '../../vision/models';
import type { PeopleStore } from './people-store';
import type { GroupPlacement } from './records';
import type { VisibleFace } from './rows';

export const PET_MATCH_THRESHOLD = 0.85;

export interface GroupingDeps {
  readonly store: PeopleStore;
  readonly newId: () => string;
  readonly log: Logger;
}

export function thresholdOf(kind: PhotoGroupKind): number {
  return kind === 'person' ? FACE_MATCH_THRESHOLD : PET_MATCH_THRESHOLD;
}

export class Centroid {
  private readonly sum: Float32Array;
  private unit: Float32Array;

  constructor(
    readonly groupId: string,
    size: number,
  ) {
    this.sum = new Float32Array(size);
    this.unit = new Float32Array(size);
  }

  add(face: Pick<VisibleFace, 'embedding' | 'quality'>): void {
    const weight = face.quality > 0 ? face.quality : 1;
    let norm = 0;
    for (let index = 0; index < this.sum.length; index += 1) {
      const value = (this.sum[index] ?? 0) + weight * (face.embedding[index] ?? 0);
      this.sum[index] = value;
      norm += value * value;
    }
    const length = Math.sqrt(norm);
    for (let index = 0; index < this.sum.length; index += 1)
      this.unit[index] = length === 0 ? 0 : (this.sum[index] ?? 0) / length;
  }

  get group(): ClusterGroup {
    return { id: this.groupId, centroid: this.unit };
  }
}

export function partitionOf(face: VisibleFace): string {
  return `${face.species ?? ''}\u0000${face.model}`;
}

export function partitions(faces: readonly VisibleFace[]): VisibleFace[][] {
  const parts = new Map<string, VisibleFace[]>();
  for (const face of faces) {
    appendTo(parts, partitionOf(face), face);
  }
  return [...parts.values()];
}

export function centroidsOf(faces: readonly VisibleFace[]): Map<string, Centroid> {
  const centroids = new Map<string, Centroid>();
  for (const face of faces) {
    if (face.groupId === null) continue;
    const centroid =
      centroids.get(face.groupId) ?? new Centroid(face.groupId, face.embedding.length);
    centroid.add(face);
    centroids.set(face.groupId, centroid);
  }
  return centroids;
}

const SLICE_MS = 4;

function tick(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

interface Placement {
  readonly groupId: string;
  readonly faceId: string;
  readonly created: boolean;
}

export class PeopleGrouper {
  constructor(
    private readonly deps: GroupingDeps,
    private readonly changed: (profileId: string) => void,
  ) {}

  async regroup(profileId: string, kind: PhotoGroupKind): Promise<number> {
    const { store } = this.deps;
    const source = await store.regroupSource(profileId, kind);
    if (source.state === 'refused') return 0;
    if (source.state === 'settled') {
      await store.tidy(profileId, kind);
      return 0;
    }
    const { faces, rejected } = source;
    const placements: GroupPlacement[] = [];
    let created = 0;
    for (const part of partitions(faces)) {
      const placed = await this.place(kind, part, rejected);
      placements.push(...placed.placements);
      created += placed.created;
    }
    await store.place(profileId, kind, placements);
    this.changed(profileId);
    this.deps.log.info('groups.reclustered', { profileId, kind, faces: faces.length, created });
    return created;
  }

  private async place(
    kind: PhotoGroupKind,
    part: readonly VisibleFace[],
    rejected: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<{ readonly placements: GroupPlacement[]; readonly created: number }> {
    const centroids = centroidsOf(part);
    const placements: Placement[] = [];
    let started = performance.now();
    for (const face of part) {
      if (face.groupId !== null) continue;
      placements.push(this.assign(face, kind, centroids, rejected));
      if (performance.now() - started >= SLICE_MS) {
        await tick();
        started = performance.now();
      }
    }
    return {
      placements: grouped(part, placements),
      created: placements.filter((placement) => placement.created).length,
    };
  }

  private assign(
    face: VisibleFace,
    kind: PhotoGroupKind,
    centroids: Map<string, Centroid>,
    rejected: ReadonlyMap<string, ReadonlySet<string>>,
  ): Placement {
    const match = assignIncremental(
      face.embedding,
      [...centroids.values()].map((centroid) => centroid.group),
      rejected.get(face.id) ?? new Set<string>(),
      thresholdOf(kind),
    );
    if (match.groupId !== null) {
      centroids.get(match.groupId)?.add(face);
      return { groupId: match.groupId, faceId: face.id, created: false };
    }
    const groupId = this.deps.newId();
    const centroid = new Centroid(groupId, face.embedding.length);
    centroid.add(face);
    centroids.set(groupId, centroid);
    return { groupId, faceId: face.id, created: true };
  }
}

function grouped(part: readonly VisibleFace[], placements: readonly Placement[]): GroupPlacement[] {
  const species = new Map(part.map((face) => [face.id, face.species]));
  const byGroup = new Map<string, string[]>();
  for (const placement of placements) appendTo(byGroup, placement.groupId, placement.faceId);
  return [...byGroup].flatMap(([groupId, faceIds]) => {
    const first = faceIds[0];
    return first === undefined ? [] : [{ groupId, faceIds, species: species.get(first) ?? null }];
  });
}
