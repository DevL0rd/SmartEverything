import { describe, expect, it } from 'vitest';
import { describePhoto, searchWords } from '../../../src/photos/ai/description';
import { distinctFaces } from '../../../src/photos/ai/faces-job';
import { regionOf } from '../../../src/photos/ai/pet-job';
import type { DetectedFace } from '../../../src/vision/faces/engine';

const POINT = { x: 0.5, y: 0.5 } as const;

function face(quality: number, embedding: number[]): DetectedFace {
  return {
    box: { x: 0, y: 0, w: 0.5, h: 0.5 },
    landmarks: [POINT, POINT, POINT, POINT, POINT],
    score: 0.9,
    quality,
    embedding: Float32Array.from(embedding),
  };
}

describe('the description document', () => {
  const analysis = {
    caption: 'A dog runs on a beach.',
    scene: 'beach',
    labels: ['dog', 'sand'],
    pets: [
      { species: 'dog', box: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      { species: 'dog', box: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
    ],
  };

  it('joins caption, scene, labels, species, place and month', () => {
    expect(
      describePhoto({ analysis, takenAt: '2026-03-04T10:00:00.000Z', place: 'Lisbon, PT' }),
    ).toBe(
      'A dog runs on a beach. Scene: beach. Contains: dog, sand. Pets: dog. Place: Lisbon, PT. March 2026',
    );
  });

  it('leaves out what is missing', () => {
    expect(
      describePhoto({
        analysis: { caption: null, scene: null, labels: [], pets: [] },
        takenAt: null,
        place: null,
      }),
    ).toBe('');
  });

  it('lists scene, labels and species as search words', () => {
    expect(searchWords(analysis)).toEqual(['beach', 'dog', 'sand', 'dog', 'dog']);
    expect(searchWords({ scene: null, labels: [], pets: [] })).toEqual([]);
  });
});

describe('faces of one video', () => {
  it('keeps the best face of each distinct person', () => {
    const kept = distinctFaces([
      face(0.4, [1, 0, 0]),
      face(0.9, [0.99, 0.01, 0]),
      face(0.5, [0, 1, 0]),
    ]);
    expect(kept.map((entry) => entry.quality)).toEqual([0.9, 0.5]);
  });
});

describe('pet crops', () => {
  it('maps a fractional box to pixels inside the picture', () => {
    expect(regionOf({ x: 0.2, y: 0.1, w: 0.5, h: 0.5 }, 100, 80)).toEqual({
      left: 20,
      top: 8,
      width: 50,
      height: 40,
    });
  });

  it('clamps a box that reaches past the edge and never returns an empty crop', () => {
    expect(regionOf({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 100)).toEqual({
      left: 90,
      top: 90,
      width: 10,
      height: 10,
    });
    expect(regionOf({ x: 1, y: 1, w: 0.001, h: 0.001 }, 100, 100)).toEqual({
      left: 99,
      top: 99,
      width: 1,
      height: 1,
    });
  });
});
