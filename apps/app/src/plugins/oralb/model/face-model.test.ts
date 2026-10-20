import { describe, expect, it } from 'vitest';
import { faceLabel, faceOf, faceText, isSpecial } from './face-model';

describe('the result face', () => {
  it('shows nothing for no face and for level zero', () => {
    expect(faceOf(null)).toBeNull();
    expect(faceOf(0)).toEqual({ level: 0, kind: 'none', stars: 0 });
    expect(faceText(faceOf(0))).toBeNull();
    expect(faceLabel(faceOf(0))).toBe('No face shown');
  });

  it('draws level one neutral and the rest as smiles with one to three stars', () => {
    expect(faceOf(1)).toEqual({ level: 1, kind: 'neutral', stars: 0 });
    const stars = [2, 4, 5, 8, 9, 11].map((level) => faceOf(level)?.stars);
    expect(stars).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('clamps and rounds levels to the eleven the handle can show', () => {
    expect(faceOf(40)?.level).toBe(11);
    expect(faceOf(6.6)?.level).toBe(7);
    expect(faceOf(-3)?.kind).toBe('none');
  });

  it('counts a special face from level two', () => {
    expect(isSpecial(1)).toBe(false);
    expect(isSpecial(2)).toBe(true);
    expect(isSpecial(null)).toBe(false);
  });

  it('says which face the handle showed without claiming a meaning', () => {
    expect(faceText(faceOf(7))).toBe('The handle showed face 7 of 11');
    expect(faceLabel(faceOf(7))).toBe('Smiling face, 2 stars');
    expect(faceLabel(faceOf(2))).toBe('Smiling face, 1 star');
    expect(faceLabel(faceOf(1))).toBe('Neutral face');
  });
});
