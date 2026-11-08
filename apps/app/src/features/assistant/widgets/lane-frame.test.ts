import { describe, expect, it } from 'vitest';
import { frameClassOf } from '../../../components/widget-board';
import { tierInnerHeight } from '../../../components/widget-board/tier';
import { frameOfPlaced, NOMINAL_CHAT_WIDTH } from './lane-frame';

const context = { idiom: 'touch', density: 'comfortable', padding: 16 } as const;

describe('frameOfPlaced', () => {
  it('returns the content box of a placed widget', () => {
    expect(frameOfPlaced({ width: 358, height: 172 }, context)).toStrictEqual({
      width: 326,
      height: 140,
      idiom: 'touch',
    });
  });

  it('falls back to the tier M box when the slot has no box', () => {
    expect(frameOfPlaced({ width: null, height: null }, context)).toStrictEqual({
      width: NOMINAL_CHAT_WIDTH,
      height: tierInnerHeight('M', 'touch', 'comfortable'),
      idiom: 'touch',
    });
  });

  it('falls back when only one dimension is missing', () => {
    expect(frameOfPlaced({ width: 300, height: null }, context).width).toBe(NOMINAL_CHAT_WIDTH);
  });

  it.each(['touch', 'pointer'] as const)(
    'keeps the %s fallback frame in the medium class',
    (idiom) => {
      const box = frameOfPlaced({ width: null, height: null }, { ...context, idiom });
      expect(frameClassOf(box)).toBe('m');
    },
  );

  it('never gives a tile slot a short-strip frame class', () => {
    const lone = frameOfPlaced({ width: 358, height: 172 }, context);
    const shared = frameOfPlaced({ width: 173, height: 172 }, context);
    expect(frameClassOf(lone)).toBe('m');
    expect(frameClassOf(shared)).toBe('s');
  });
});
