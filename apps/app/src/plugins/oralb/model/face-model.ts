export const FACE_LEVELS = 11;

export type FaceKind = 'none' | 'neutral' | 'smile';

export interface Face {
  readonly level: number;
  readonly kind: FaceKind;
  readonly stars: 0 | 1 | 2 | 3;
}

function starsOf(level: number): 0 | 1 | 2 | 3 {
  if (level >= 9) {
    return 3;
  }
  if (level >= 5) {
    return 2;
  }
  return level >= 2 ? 1 : 0;
}

export function faceOf(level: number | null): Face | null {
  if (level === null) {
    return null;
  }
  const clamped = Math.min(FACE_LEVELS, Math.max(0, Math.round(level)));
  if (clamped === 0) {
    return { level: 0, kind: 'none', stars: 0 };
  }
  return { level: clamped, kind: clamped === 1 ? 'neutral' : 'smile', stars: starsOf(clamped) };
}

export function isSpecial(level: number | null): boolean {
  return level !== null && level >= 2;
}

export function faceText(face: Face | null): string | null {
  if (face === null || face.kind === 'none') {
    return null;
  }
  return `The handle showed face ${String(face.level)} of ${String(FACE_LEVELS)}`;
}

export function faceLabel(face: Face | null): string {
  if (face === null || face.kind === 'none') {
    return 'No face shown';
  }
  const stars =
    face.stars === 0 ? '' : `, ${String(face.stars)} ${face.stars === 1 ? 'star' : 'stars'}`;
  return `${face.kind === 'neutral' ? 'Neutral face' : 'Smiling face'}${stars}`;
}
