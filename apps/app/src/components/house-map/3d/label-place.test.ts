import { describe, expect, it } from 'vitest';
import {
  ROOM_LABEL_SPOTS,
  boxesMeet,
  ellipsized,
  labelBox,
  placeAtSpots,
  placeLabels,
  robotBox,
} from './label-place';

const FONT = 12;

describe('room label placement', () => {
  it('moves a label that the robot covers clear of the robot', () => {
    const robot = robotBox({ x: 100, y: 100, radius: 10 });
    const [placed] = placeLabels([{ roomId: 1, x: 100, y: 104, text: 'Bedroom' }], FONT, [robot]);
    expect(placed).toBeDefined();
    if (placed === undefined) return;
    expect(boxesMeet(labelBox(placed, FONT), robot)).toBe(false);
    expect(placed.x).toBe(100);
  });

  it('keeps a label that is already clear where it is', () => {
    const robot = robotBox({ x: 10, y: 10, radius: 8 });
    const label = { roomId: 2, x: 200, y: 200, text: 'Kitchen' };
    expect(placeLabels([label], FONT, [robot])).toStrictEqual([label]);
  });

  it('moves a later label that would sit on an earlier one instead of dropping it', () => {
    const placed = placeLabels(
      [
        { roomId: 1, x: 100, y: 100, text: 'Bedroom' },
        { roomId: 2, x: 104, y: 102, text: 'Hall' },
        { roomId: 3, x: 300, y: 100, text: 'Study' },
      ],
      FONT,
      [],
    );
    expect(placed.map((label) => label.roomId)).toStrictEqual([1, 2, 3]);
    const [bedroom, hall] = placed.map((label) => labelBox(label, FONT));
    expect(bedroom !== undefined && hall !== undefined && boxesMeet(bedroom, hall)).toBe(false);
  });

  it('keeps every label of a crowded phone stage, nudged apart where room allows', () => {
    const crowded = ['Living room', 'Kitchen', 'Hall', 'Bedroom', 'Bathroom'].map(
      (text, index) => ({ roomId: index + 1, x: 150 + index * 8, y: 120 + index * 4, text }),
    );
    const placed = placeLabels(crowded, FONT, [], {
      padPx: 8,
      bounds: { width: 380, height: 300 },
    });
    expect(placed.map((label) => label.text)).toStrictEqual(crowded.map((label) => label.text));
    const boxes = placed.map((label) => labelBox(label, FONT, 8));
    const meeting = boxes.flatMap((box, index) =>
      boxes.slice(index + 1).filter((other) => boxesMeet(box, other)),
    );
    expect(meeting).toStrictEqual([]);
  });

  it('moves a label that would cross the stage edge back inside it', () => {
    const [placed] = placeLabels([{ roomId: 1, x: 4, y: 6, text: 'Living room' }], FONT, [], {
      padPx: 6,
      bounds: { width: 300, height: 200 },
    });
    expect(placed).toBeDefined();
    if (placed === undefined) return;
    const box = labelBox(placed, FONT, 6);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });
});

describe('placing labels at fixed spots', () => {
  const label = { x: 200, y: 200, text: 'Hall' };
  const keepOutAt = (y: number): ReturnType<typeof labelBox> =>
    labelBox({ x: 200, y, text: 'Hall' }, 12, 8);

  it('tries the centre, then 30 and 60 px above and below, then 50 px left and right', () => {
    const order = ROOM_LABEL_SPOTS.map(([dx, dy]) => [dx, dy]);
    expect(order).toEqual([
      [0, 0],
      [0, -30],
      [0, 30],
      [0, -60],
      [0, 60],
      [-50, 0],
      [50, 0],
    ]);
    const spots = { padPx: 0, spots: ROOM_LABEL_SPOTS };
    expect(placeAtSpots([label], 12, [], spots)[0]).toEqual(label);
    expect(placeAtSpots([label], 12, [keepOutAt(200)], spots)[0]).toEqual({ ...label, y: 170 });
    const vertical = [
      keepOutAt(200),
      keepOutAt(170),
      keepOutAt(230),
      keepOutAt(140),
      keepOutAt(260),
    ];
    expect(placeAtSpots([label], 12, vertical, spots)[0]).toEqual({ ...label, x: 150 });
  });

  it('never puts two labels on the same spot', () => {
    const placed = placeAtSpots([label, { ...label, text: 'Hall' }], 12, [], {
      padPx: 8,
      spots: ROOM_LABEL_SPOTS,
    });
    const [first, second] = placed;
    if (first === undefined || second === undefined) throw new Error('missing label');
    expect(boxesMeet(labelBox(first, 12, 8), labelBox(second, 12, 8))).toBe(false);
  });

  it('ends a text that does not fit with an ellipsis and keeps a short one whole', () => {
    expect(ellipsized('Kitchen', 12, 154)).toBe('Kitchen');
    const cut = ellipsized('A very long room name that never fits the pill', 12, 154);
    expect(cut.endsWith('\u2026')).toBe(true);
    expect(cut.length * 12 * 0.58).toBeLessThanOrEqual(154);
  });
});
