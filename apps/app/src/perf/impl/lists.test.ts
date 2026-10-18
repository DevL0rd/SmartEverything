import { describe, expect, it } from 'vitest';
import { listStat, emptyWindow } from './collector';
import { ListTracker, blankOf } from './lists';

const cells = (rows: [number, number, number][]): Map<number, { y: number; height: number }> =>
  new Map(rows.map(([index, y, height]) => [index, { y, height }]));

describe('blankOf', () => {
  it('is zero when the cells cover the viewport', () => {
    expect(
      blankOf(
        cells([
          [0, 0, 400],
          [1, 400, 400],
        ]),
        10,
        100,
        600,
      ),
    ).toBe(0);
  });

  it('measures blank below the last mounted cell when more rows exist', () => {
    expect(
      blankOf(
        cells([
          [3, 300, 100],
          [4, 400, 100],
        ]),
        20,
        300,
        500,
      ),
    ).toBe(300);
  });

  it('measures blank above the first mounted cell', () => {
    expect(blankOf(cells([[5, 500, 100]]), 20, 300, 500)).toBe(400);
  });

  it('does not count the end of the content as blank', () => {
    expect(
      blankOf(
        cells([
          [0, 0, 100],
          [1, 100, 100],
        ]),
        2,
        0,
        600,
      ),
    ).toBe(0);
  });

  it('is zero without cells or a viewport', () => {
    expect(blankOf(new Map(), 5, 0, 600)).toBe(0);
    expect(blankOf(cells([[0, 0, 10]]), 5, 0, 0)).toBe(0);
  });
});

describe('ListTracker', () => {
  it('tracks mounted rows, blank samples and scroll frames', () => {
    const data = emptyWindow();
    const tracker = new ListTracker(
      (list) => listStat(data, 'screen', list),
      () => 'screen',
    );
    tracker.rows('l', 1, 10);
    tracker.rows('l', 1, 10);
    tracker.rows('l', -1, 10);
    tracker.viewport('l', 500);
    tracker.cell('l', 3, 300, 100);
    tracker.content('l', 3000);
    tracker.scroll('l', 300, 1000);
    tracker.frame(80, 1050);
    tracker.frame(10, 2000);
    const stat = listStat(data, 'screen', 'l');
    expect(stat.mountedMax).toBe(2);
    expect(stat.mountedMin).toBe(1);
    expect(stat.total).toBe(10);
    expect(stat.blankSamples).toBe(1);
    expect(stat.blankMax).toBe(400);
    expect(stat.scrollFrames).toBe(1);
    expect(stat.scrollJanks).toBe(1);
    expect(stat.content).toBe(3000);
    expect(stat.viewport).toBe(500);
    expect(stat.offsetMax).toBe(300);
    expect(stat.firstIndex).toBe(3);
    expect(stat.lastIndex).toBe(3);
    expect(stat.cellMax).toBe(100);
  });
});
