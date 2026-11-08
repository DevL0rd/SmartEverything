import { describe, expect, it } from 'vitest';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { activityRowCount, consumerRowCount, sceneGrid, securityRowCount } from './widget-fit';

const TOUCH = SEMANTIC_SIZES.touch.comfortable;
const POINTER = SEMANTIC_SIZES.pointer.comfortable;

describe('activityRowCount', () => {
  it('fits two-line rows into the body', () => {
    expect(activityRowCount(272, 'touch', TOUCH, false)).toBe(3);
    expect(activityRowCount(252, 'pointer', POINTER, false)).toBe(4);
  });

  it('reserves the See all footer', () => {
    expect(activityRowCount(272, 'touch', TOUCH, true)).toBe(2);
  });

  it('keeps the footer visible when the pointer text is taller than the compact row token', () => {
    expect(activityRowCount(248, 'pointer', SEMANTIC_SIZES.pointer.compact, true)).toBe(3);
  });

  it('always shows at least one row', () => {
    expect(activityRowCount(40, 'touch', TOUCH, true)).toBe(1);
  });
});

describe('sceneGrid', () => {
  it('shows every scene when the rows fit', () => {
    expect(sceneGrid(272, 7, 2, TOUCH)).toEqual({ shown: 7, more: 0 });
  });

  it('counts the scenes that did not fit and keeps room for the more link', () => {
    expect(sceneGrid(140, 7, 2, TOUCH)).toEqual({ shown: 2, more: 5 });
    expect(sceneGrid(272, 20, 2, TOUCH)).toEqual({ shown: 6, more: 14 });
  });
});

describe('consumerRowCount', () => {
  it('shows at most three consumers', () => {
    expect(consumerRowCount(400, 44, 8)).toBe(3);
  });

  it('shows what the body has room for', () => {
    expect(consumerRowCount(88, 44, 8)).toBe(1);
    expect(consumerRowCount(40, 44, 8)).toBe(0);
  });

  it('never shows more than exist', () => {
    expect(consumerRowCount(400, 44, 2)).toBe(2);
  });
});

describe('securityRowCount', () => {
  it('shows every line when they fit', () => {
    expect(securityRowCount(272, 7)).toEqual({ shown: 7, more: 0 });
  });

  it('counts the lines that did not fit and keeps room for the more line', () => {
    expect(securityRowCount(100, 5)).toEqual({ shown: 2, more: 3 });
  });

  it('always shows at least one line', () => {
    expect(securityRowCount(20, 3)).toEqual({ shown: 1, more: 2 });
  });
});
