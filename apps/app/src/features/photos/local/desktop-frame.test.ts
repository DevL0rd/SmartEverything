import { describe, expect, it } from 'vitest';
import { frameSize } from './desktop-frame';

describe('desktop thumbnail frame size', () => {
  it('scales the shortest side to the tile pixels', () => {
    expect(frameSize(4000, 3000, 464)).toEqual({ width: 619, height: 464 });
    expect(frameSize(3840, 2160, 464)).toEqual({ width: 825, height: 464 });
    expect(frameSize(1080, 1920, 464)).toEqual({ width: 464, height: 825 });
  });

  it('never enlarges media smaller than the tile', () => {
    expect(frameSize(320, 240, 464)).toEqual({ width: 320, height: 240 });
  });
});
