import { describe, expect, it } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import {
  bodyHeightOf,
  INTERNET_WIDGET_SIZES,
  internetFaceOf,
  PEOPLE_WIDGET_SIZES,
  peopleFaceOf,
} from './frame-faces';

const CLASSES: readonly FrameClass[] = ['xs', 's', 'm', 'l', 'w', 'xl'];

describe('internetFaceOf', () => {
  it('chooses the face from the frame class and never from the size letter', () => {
    expect(CLASSES.map(internetFaceOf)).toEqual([
      'compact',
      'tile',
      'compact',
      'tall',
      'wide',
      'wide',
    ]);
  });
});

describe('peopleFaceOf', () => {
  it('stacks avatars when narrow, scrolls chips when short and lists rows when tall', () => {
    expect(CLASSES.map(peopleFaceOf)).toEqual(['chips', 'stack', 'chips', 'rows', 'chips', 'rows']);
  });
});

describe('widget sizes', () => {
  it('offers Wide for Internet only where it differs from Medium, and never for people', () => {
    expect(INTERNET_WIDGET_SIZES.compact).not.toContain('W');
    expect(INTERNET_WIDGET_SIZES.medium).toContain('W');
    expect(INTERNET_WIDGET_SIZES.expanded).toContain('W');
    expect(Object.values(PEOPLE_WIDGET_SIZES).flat()).not.toContain('W');
  });
});

describe('bodyHeightOf', () => {
  it('removes the header and the gap, with a taller header on touch', () => {
    expect(bodyHeightOf({ width: 300, height: 140, idiom: 'touch' })).toBe(88);
    expect(bodyHeightOf({ width: 300, height: 140, idiom: 'pointer' })).toBe(96);
    expect(bodyHeightOf({ width: 300, height: 20, idiom: 'touch' })).toBe(0);
  });
});
