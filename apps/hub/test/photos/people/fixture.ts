import { randomUUID } from 'node:crypto';
import type { PhotoGroupKind } from '@smarteverything/domain';
import { PhotoAnalysisRepository } from '../../../src/store/repositories/photo-analysis';
import { PhotoFacesRepository } from '../../../src/store/repositories/photo-faces';
import { PhotoGroupsRepository } from '../../../src/store/repositories/photo-groups';
import { mergeSuggestionsFor } from '../../../src/photos/people/merge-suggestions';
import type { PeopleStore } from '../../../src/photos/people/people-store';
import { PeopleRecords } from '../../../src/photos/people/records';
import { PeopleService } from '../../../src/photos/people/service';
import { PhotoSuggest } from '../../../src/photos/people/suggest';
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

function later<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

function contextPeople(): PeopleStore {
  const records = new PeopleRecords({
    context,
    groups: groups(),
    faces: faces(),
    consent: {
      faceGrouping: (profileId): boolean => consent.face.get(profileId) ?? true,
      smartSearch: (profileId): boolean => consent.smart.get(profileId) ?? true,
    },
  });
  const suggest = new PhotoSuggest(context, groups());
  return {
    profiles: () => Promise.resolve([alice.profileId, bob.profileId]),
    regroupSource: (profileId, kind) => later(() => records.regroupSource(profileId, kind)),
    place: (profileId, kind, placements) =>
      later(() => {
        records.place(profileId, kind, placements);
      }),
    tidy: (profileId, kind) =>
      later(() => {
        records.tidy(profileId, kind);
      }),
    people: (actor, kind, suggestions) => later(() => records.people(actor, kind, suggestions)),
    group: (actor, groupId) => later(() => records.group(actor, groupId)),
    groupsMatching: (actor, groupIds) => later(() => records.groupsMatching(actor, groupIds)),
    itemFaces: (actor, itemId) => later(() => records.itemFaces(actor, itemId)),
    suggest: (actor, query) => later(() => suggest.read(actor, query)),
    dismissMerge: (actor, dismiss) =>
      later(() => {
        records.dismissMerge(actor, dismiss);
      }),
    update: (actor, groupId, patch) => later(() => records.update(actor, groupId, patch)),
    merge: (actor, merge) => later(() => records.merge(actor, merge)),
    rejectFaces: (actor, groupId, body) => later(() => records.rejectFaces(actor, groupId, body)),
  };
}

export function people(): PeopleService {
  return new PeopleService({
    store: contextPeople(),
    newId: randomUUID,
    log: testLogger('photos'),
    regrouped: (profileId): void => {
      regrouped.push(profileId);
    },
    suggestions: (profileId) => Promise.resolve(mergeSuggestionsFor(context, profileId)),
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
    text: null,
    labels,
    pets: [],
    error: null,
  });
}
