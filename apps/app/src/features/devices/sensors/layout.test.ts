import { describe, expect, it } from 'vitest';
import { RING_PX, SPARK_PX } from './layout';

const M_FRAME_HEIGHT = 188;
const CARD_PAD = 16;
const ACTION_ROW = 48;
const ROW_GAP = 6;
const COLUMN_GAP = 4;
const TITLE_LINE = 22;
const STATE_LINE = 18;
const INFO_GAP = 2;
const PILL_LINE = 16;

describe('the purifier and humidifier graph row at m', () => {
  it('fits under the title and state line inside the 188 px card', () => {
    const column = M_FRAME_HEIGHT - 2 * CARD_PAD - ACTION_ROW - ROW_GAP;
    const needs = TITLE_LINE + INFO_GAP + STATE_LINE + COLUMN_GAP + RING_PX.m;
    expect(needs).toBeLessThanOrEqual(column);
  });

  it('fits the sparkline and the level pill beside the ring', () => {
    expect(SPARK_PX.m + COLUMN_GAP + PILL_LINE).toBeLessThanOrEqual(RING_PX.m);
  });
});
