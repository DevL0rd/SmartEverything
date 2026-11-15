import { appendTo, type PhotoGroupKind } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoreContext } from '../../store/context';
import type { PhotoGroupsRepository } from '../../store/repositories/photo-groups';
import { assignIncremental, type ClusterGroup } from '../../vision/cluster';
import { FACE_MATCH_THRESHOLD } from '../../vision/models';
import { PeopleRows, type VisibleFace } from './rows';

export const PET_MATCH_THRESHOLD = 0.85;

export interface GroupingConsent {
  readonly faceGrouping: (profileId: string) => boolean;
  readonly smartSearch: (profileId: string) => boolean;
}

export interface GroupingDeps {
  readonly context: StoreContext;
  readonly groups: PhotoGroupsRepository;
  readonly consent: GroupingConsent;
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

const YIELD_EVERY = 256;

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
  private readonly rows: PeopleRows;

  constructor(
    private readonly deps: GroupingDeps,
    private readonly changed: (profileId: string) => void,
  ) {
    this.rows = new PeopleRows(deps.context);
  }

  allowed(profileId: string, kind: PhotoGroupKind): boolean {
    const { consent } = this.deps;
    return kind === 'person' ? consent.faceGrouping(profileId) : consent.smartSearch(profileId);
  }

  async regroup(profileId: string, kind: PhotoGroupKind): Promise<number> {
    if (!this.allowed(profileId, kind)) return 0;
    if (!this.rows.hasUnassigned(profileId, kind)) {
      this.tidy(profileId, kind);
      return 0;
    }
    const faces = this.rows.visibleFaces(profileId, kind);
    const rejected = this.rows.rejections(profileId);
    let created = 0;
    for (const part of partitions(faces))
      created += await this.place(profileId, kind, part, rejected);
    this.tidy(profileId, kind);
    this.changed(profileId);
    this.deps.log.info('groups.reclustered', { profileId, kind, faces: faces.length, created });
    return created;
  }

  private async place(
    profileId: string,
    kind: PhotoGroupKind,
    part: readonly VisibleFace[],
    rejected: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<number> {
    const centroids = centroidsOf(part);
    const placements: Placement[] = [];
    let seen = 0;
    for (const face of part) {
      if (face.groupId !== null) continue;
      placements.push(this.assign(face, kind, centroids, rejected));
      seen += 1;
      if (seen % YIELD_EVERY === 0) await tick();
    }
    this.save(profileId, kind, part, placements);
    return placements.filter((placement) => placement.created).length;
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

  private save(
    profileId: string,
    kind: PhotoGroupKind,
    part: readonly VisibleFace[],
    placements: readonly Placement[],
  ): void {
    if (placements.length === 0) return;
    const species = new Map(part.map((face) => [face.id, face.species]));
    const byGroup = new Map<string, string[]>();
    for (const placement of placements) appendTo(byGroup, placement.groupId, placement.faceId);
    const { groups } = this.deps;
    this.deps.context.write(() => {
      for (const [groupId, faceIds] of byGroup) {
        const first = faceIds[0];
        if (first === undefined) continue;
        if (groups.find(groupId) === undefined)
          groups.insert({
            id: groupId,
            profileId,
            kind,
            species: species.get(first) ?? null,
            name: null,
            coverFaceId: first,
          });
        groups.assign(groupId, faceIds, 'auto');
      }
    });
  }

  tidy(profileId: string, kind: PhotoGroupKind): void {
    const { sql } = this.deps.context;
    this.deps.context.write(() => {
      sql.run(
        'remove the unnamed photo groups that lost every face',
        `delete from photo_groups
          where profile_id = $profileId and kind = $kind
            and name is null and linked_profile_id is null
            and not exists (select 1 from photo_group_faces gf
              where gf.group_id = photo_groups.id and gf.source <> 'rejected')`,
        { profileId, kind },
      );
      sql.run(
        'give the photo groups without a cover their best face',
        `update photo_groups set cover_face_id = (
            select gf.face_id from photo_group_faces gf join photo_faces f on f.id = gf.face_id
            where gf.group_id = photo_groups.id and gf.source <> 'rejected'
            order by f.quality desc, f.id limit 1)
          where profile_id = $profileId and kind = $kind and cover_face_id is null`,
        { profileId, kind },
      );
    });
  }
}
