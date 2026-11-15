import { randomUUID } from 'node:crypto';
import type { PhotoGroupKind } from '@smarteverything/domain';
import { PhotoAnalysisRepository } from '../../../src/store/repositories/photo-analysis';
import { PhotoFacesRepository } from '../../../src/store/repositories/photo-faces';
import { PhotoGroupsRepository } from '../../../src/store/repositories/photo-groups';
import { PeopleService } from '../../../src/photos/people/service';
import { float32Bytes } from '../../../src/photos/ai/vectors';
import { testLogger } from '../../support/logs';
import {
  BOB_ROOT,
  alice,
  bob,
  context,
  database,
  seed,
  setup,
  teardown,
} from '../insights-fixture';

export { BOB_ROOT, alice, bob, context, database, seed, setup, teardown };

export const SIZE = 16;

export const consent = { face: new Map<string, boolean>(), smart: new Map<string, boolean>() };

export const faces = (): PhotoFacesRepository => new PhotoFacesRepository(context);

export const groups = (): PhotoGroupsRepository => new PhotoGroupsRepository(context);

export const analysis = (): PhotoAnalysisRepository => new PhotoAnalysisRepository(context);

export const regrouped: string[] = [];

export function resetConsent(): void {
  consent.face.clear();
  consent.smart.clear();
}

export function people(): PeopleService {
  return new PeopleService({
    context,
    groups: groups(),
    faces: faces(),
    consent: {
      faceGrouping: (profileId) => consent.face.get(profileId) ?? true,
      smartSearch: (profileId) => consent.smart.get(profileId) ?? true,
    },
    newId: randomUUID,
    log: testLogger('photos'),
    profiles: () => [alice.profileId, bob.profileId],
    regrouped: (profileId): void => {
      regrouped.push(profileId);
    },
  });
}

export function direction(axis: number, tilt = 0): Float32Array {
  const vector = new Float32Array(SIZE);
  vector[axis] = 1;
  vector[(axis + 1) % SIZE] = tilt;
  const norm = Math.hypot(1, tilt);
  return vector.map((value) => value / norm);
}

export interface FaceSpec {
  readonly itemId: string;
  readonly embedding: Float32Array;
  readonly kind?: PhotoGroupKind;
  readonly species?: string;
  readonly quality?: number;
  readonly model?: string;
}

export function addFace(spec: FaceSpec): string {
  const id = randomUUID();
  const kind = spec.kind ?? 'person';
  const repository = faces();
  const existing = repository.forItem(spec.itemId).filter((row) => row.kind === kind);
  repository.replaceKindForItem(spec.itemId, kind, [
    ...existing,
    {
      id,
      itemId: spec.itemId,
      rev: 1,
      kind,
      species: kind === 'pet' ? (spec.species ?? 'dog') : null,
      box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      landmarks: null,
      score: 0.9,
      quality: spec.quality ?? 0.8,
      model: spec.model ?? (kind === 'person' ? 'sface' : 'embed'),
      vector: float32Bytes(spec.embedding),
    },
  ]);
  return id;
}

export function addText(itemId: string, body: string): void {
  database
    .prepare(
      `insert into drive_item_text (item_id, rev, source, state, reason, chars, extracted_at)
        values (?, 1, 'image', 'ok', null, ?, '2026-11-14T10:00:00.000Z')`,
    )
    .run(itemId, body.length);
  database
    .prepare('insert into drive_item_text_search (item_id, body) values (?, ?)')
    .run(itemId, body);
}

export function addLabels(itemId: string, labels: readonly string[]): void {
  database.prepare('delete from drive_items_search where item_id = ?').run(itemId);
  database
    .prepare(
      `insert into drive_items_search (item_id, name, path, camera, albums, dates, labels)
        values (?, ?, '', '', '', '', ?)`,
    )
    .run(itemId, itemId, labels.join(' '));
  analysis().save({
    itemId,
    rev: 1,
    model: 'm',
    state: 'done',
    caption: null,
    scene: null,
    labels,
    pets: [],
    error: null,
  });
}
