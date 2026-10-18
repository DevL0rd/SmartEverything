import { describe, expect, it } from 'vitest';
import { frameClassOf } from '../../../components/widget-board';
import { frameOfPlaced, NOMINAL_CHAT_FRAME } from './lane-frame';

const context = { idiom: 'touch', padding: 16 } as const;

describe('frameOfPlaced', () => {
  it('returns the content box of a placed widget', () => {
    expect(frameOfPlaced({ width: 358, height: 176 }, context)).toStrictEqual({
      width: 326,
      height: 144,
      idiom: 'touch',
    });
  });

  it('falls back to the nominal chat frame when the slot has no box', () => {
    expect(frameOfPlaced({ width: null, height: null }, context)).toStrictEqual({
      ...NOMINAL_CHAT_FRAME,
      idiom: 'touch',
    });
  });

  it('falls back when only one dimension is missing', () => {
    expect(frameOfPlaced({ width: 300, height: null }, context).width).toBe(
      NOMINAL_CHAT_FRAME.width,
    );
  });

  it('keeps the nominal frame in the medium class', () => {
    expect(frameClassOf(frameOfPlaced({ width: null, height: null }, context))).toBe('m');
  });

  it('never gives a tile slot a short-strip frame class', () => {
    const lone = frameOfPlaced({ width: 358, height: 172 }, context);
    const shared = frameOfPlaced({ width: 173, height: 172 }, context);
    expect(frameClassOf(lone)).toBe('m');
    expect(frameClassOf(shared)).toBe('s');
  });
});
