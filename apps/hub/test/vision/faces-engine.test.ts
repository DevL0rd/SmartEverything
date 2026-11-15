import { beforeAll, describe, expect, it } from 'vitest';
import { cosine } from '../../src/vision/cluster';
import type { DetectedFace, FaceEngine } from '../../src/vision/faces/engine';
import { FACE_EMBEDDING_SIZE, FACE_MATCH_THRESHOLD } from '../../src/vision/models';
import { blankImage, fixtureImage, loadEngine } from './fixtures';

let engine: FaceEngine;
const found = new Map<string, DetectedFace[]>();

beforeAll(async () => {
  engine = await loadEngine();
  for (const name of ['obama1', 'obama2', 'biden1', 'pair'] as const)
    found.set(name, await engine.analyse(await fixtureImage(name)));
}, 120_000);

function only(name: string): DetectedFace {
  const faces = found.get(name) ?? [];
  expect(faces).toHaveLength(1);
  const [face] = faces;
  if (face === undefined) throw new Error('no face');
  return face;
}

describe('the face engine on public portraits', () => {
  it('finds one face in a portrait and none in a picture without faces', async () => {
    only('obama1');
    expect(await engine.analyse(await blankImage(800, 600))).toStrictEqual([]);
  });

  it('finds both faces of a two person photo', () => {
    expect(found.get('pair')).toHaveLength(2);
  });

  it('describes each face with a box and landmarks inside the picture, a score and a quality', () => {
    for (const faces of found.values())
      for (const face of faces) {
        expect(face.box.x + face.box.w).toBeLessThanOrEqual(1);
        expect(face.box.y + face.box.h).toBeLessThanOrEqual(1);
        expect(face.score).toBeGreaterThanOrEqual(0.9);
        expect(face.quality).toBeGreaterThan(0);
        expect(face.quality).toBeLessThanOrEqual(1);
        expect(face.landmarks).toHaveLength(5);
        expect(face.landmarks[0].x).toBeLessThan(face.landmarks[1].x);
      }
  });

  it('embeds each face as a unit vector of 128 values', () => {
    for (const faces of found.values())
      for (const face of faces) {
        expect(face.embedding).toHaveLength(FACE_EMBEDDING_SIZE);
        expect(cosine(face.embedding, face.embedding)).toBeCloseTo(1, 5);
      }
  });

  it('puts two photos of the same person above the match threshold', () => {
    expect(cosine(only('obama1').embedding, only('obama2').embedding)).toBeGreaterThan(
      FACE_MATCH_THRESHOLD,
    );
  });

  it('keeps different people below the match threshold', () => {
    expect(cosine(only('obama1').embedding, only('biden1').embedding)).toBeLessThan(
      FACE_MATCH_THRESHOLD,
    );
    expect(cosine(only('obama2').embedding, only('biden1').embedding)).toBeLessThan(
      FACE_MATCH_THRESHOLD,
    );
  });

  it('recognises each person of the two person photo against their portraits', () => {
    const [first, second] = found.get('pair') ?? [];
    if (first === undefined || second === undefined) throw new Error('missing faces');
    const [obama, biden] = first.box.x < second.box.x ? [first, second] : [second, first];
    const left = cosine(obama.embedding, only('obama1').embedding);
    const right = cosine(biden.embedding, only('biden1').embedding);
    const swapped = Math.max(
      cosine(biden.embedding, only('obama1').embedding),
      cosine(obama.embedding, only('biden1').embedding),
    );
    expect(left).toBeGreaterThan(FACE_MATCH_THRESHOLD);
    expect(right).toBeGreaterThan(FACE_MATCH_THRESHOLD);
    expect(swapped).toBeLessThan(FACE_MATCH_THRESHOLD);
  });
});
