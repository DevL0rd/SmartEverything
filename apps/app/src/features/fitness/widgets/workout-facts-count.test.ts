import { describe, expect, it } from 'vitest';
import { workoutFactGrid } from './workout-facts-count';

describe('workoutFactGrid', () => {
  it('fits one row of facts under the title on a two-row phone frame', () => {
    expect(workoutFactGrid({ width: 348, height: 140, idiom: 'touch' })).toStrictEqual({
      columns: 4,
      rows: 1,
    });
    expect(workoutFactGrid({ width: 256, height: 140, idiom: 'touch' }).columns).toBe(3);
  });

  it('fits one row on a two-row pointer frame and every fact across a wide frame', () => {
    expect(workoutFactGrid({ width: 640, height: 120, idiom: 'pointer' })).toStrictEqual({
      columns: 7,
      rows: 1,
    });
  });

  it('adds rows when the frame is taller', () => {
    expect(workoutFactGrid({ width: 348, height: 324, idiom: 'touch' }).rows).toBe(5);
  });

  it('shows no row when the title leaves no room', () => {
    expect(workoutFactGrid({ width: 348, height: 90, idiom: 'touch' }).rows).toBe(0);
  });
});
