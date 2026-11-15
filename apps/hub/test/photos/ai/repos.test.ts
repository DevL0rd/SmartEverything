import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PhotoFaceRow } from '../../../src/store/repositories/photo-faces';
import { makeRig, type Rig } from './rig';

let rig: Rig;

beforeEach(async () => {
  rig = await makeRig();
});

afterEach(async () => {
  await rig.close();
});

function row(id: string, itemId: string, kind: 'person' | 'pet'): PhotoFaceRow {
  return {
    id,
    itemId,
    rev: 1,
    kind,
    species: kind === 'pet' ? 'dog' : null,
    box: { x: 0, y: 0, w: 0.5, h: 0.5 },
    landmarks: null,
    score: 1,
    quality: 0.5,
    model: 'm',
    vector: new Uint8Array([1, 2, 3, 4]),
  };
}

it('replaces the detections of one kind and leaves the other kind, with its group membership, alone', async () => {
  const item = await rig.photo({ n: 1, root: rig.homeRoot });
  const { photoFaces, photoGroups } = rig.opened.store;
  photoFaces.replaceForItem(item, [row('person-1', item, 'person'), row('pet-1', item, 'pet')]);
  photoGroups.insert({
    id: 'g',
    profileId: rig.owner,
    kind: 'person',
    species: null,
    name: null,
    coverFaceId: null,
  });
  photoGroups.assign('g', ['person-1'], 'auto');
  photoFaces.replaceKindForItem(item, 'pet', [row('pet-2', item, 'pet')]);
  expect(photoFaces.forItem(item).map((face) => face.id)).toEqual(['person-1', 'pet-2']);
  expect(photoGroups.faceIds('g')).toEqual(['person-1']);
  photoFaces.replaceKindForItem(item, 'pet', []);
  expect(photoFaces.forItem(item).map((face) => face.id)).toEqual(['person-1']);
});

it('pages embeddings by item id', async () => {
  const [a, b, c] = [
    await rig.photo({ n: 1, root: rig.homeRoot }),
    await rig.photo({ n: 2, root: rig.homeRoot }),
    await rig.photo({ n: 3, root: rig.homeRoot }),
  ];
  const { photoEmbeddings } = rig.opened.store;
  for (const itemId of [a, b, c])
    photoEmbeddings.save({
      itemId,
      rev: 1,
      model: 'm',
      dims: 1,
      scale: 1,
      vector: new Uint8Array([1]),
    });
  const ids = [a, b, c].toSorted();
  const first = photoEmbeddings.after(null, 2).map((embedding) => embedding.itemId);
  expect(first).toEqual(ids.slice(0, 2));
  expect(photoEmbeddings.after(first[1] ?? null, 2).map((embedding) => embedding.itemId)).toEqual(
    ids.slice(2),
  );
});
