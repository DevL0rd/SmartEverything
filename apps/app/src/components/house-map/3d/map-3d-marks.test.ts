import { describe, expect, it } from 'vitest';
import { deviceMarks, markBoxes, nearestDevice, placedMarks, sameMarks } from './map-3d-marks';
import { NO_YIELD } from './edit/overlay-model';
import { boxesMeet, labelBox } from './label-place';
import type { ChromeBox } from '../stage-fit';
import type { ScreenMarks } from './render-core-marks';

const MARKS: ScreenMarks = {
  width: 400,
  height: 300,
  labels: [{ roomId: 'kitchen', name: 'Kitchen', x: 100, y: 80 }],
  chips: [{ roomId: 'kitchen', text: '21.5°C', tone: 'info', x: 100, y: 80 }],
  robot: null,
};

describe('3d screen marks', () => {
  it('redraws when a climate chip moves, changes its reading or its tone', () => {
    const chip = MARKS.chips[0];
    if (chip === undefined) throw new Error('no chip');
    expect(sameMarks(MARKS, { ...MARKS, chips: [{ ...chip, x: 100.2 }] })).toBe(true);
    expect(sameMarks(MARKS, { ...MARKS, chips: [{ ...chip, x: 104 }] })).toBe(false);
    expect(sameMarks(MARKS, { ...MARKS, chips: [{ ...chip, text: '22°C' }] })).toBe(false);
    expect(sameMarks(MARKS, { ...MARKS, chips: [{ ...chip, tone: 'warning' }] })).toBe(false);
    expect(sameMarks(MARKS, { ...MARKS, chips: [] })).toBe(false);
  });
});

function placed(
  marks: ScreenMarks,
  keepOut: readonly ChromeBox[] = [],
): ReturnType<typeof placedMarks> {
  return placedMarks({ marks, selection: [], currentRoomId: null, keepOut, yieldTo: NO_YIELD });
}

describe('3d room labels', () => {
  it('keep their centre when it covers nothing', () => {
    const marks = { ...MARKS, chips: [] };
    expect(placed(marks).labels[0]).toMatchObject({ x: 100, y: 86 });
  });

  it('try 30 px above first when their centre covers a climate chip', () => {
    const chip = { roomId: 'kitchen', text: '21.5°C', tone: 'info' as const, x: 100, y: 64 };
    const result = placed({ ...MARKS, chips: [chip] });
    expect(result.labels[0]).toMatchObject({ x: 100, y: 56 });
    const [placedChip] = result.chips;
    if (placedChip === undefined) throw new Error('no chip');
    const label = result.labels[0];
    if (label === undefined) throw new Error('no label');
    expect(boxesMeet(labelBox(label, 12, 8), labelBox(placedChip.chip, 11, 13))).toBe(false);
  });

  it('move 50 px to the side when every spot above and below is taken by the chrome', () => {
    const chrome = [{ x: 85, y: 0, w: 30, h: 300 }];
    expect(placed({ ...MARKS, chips: [] }, chrome).labels[0]).toMatchObject({ x: 50, y: 86 });
  });

  it('end long names with an ellipsis so the pill stays within 170 px', () => {
    const long = {
      roomId: 'kitchen',
      name: 'Kitchen and dining room with the long window seat',
      x: 200,
      y: 150,
    };
    const label = placed({ ...MARKS, chips: [], labels: [long] }).labels[0];
    expect(label?.text.endsWith('\u2026')).toBe(true);
    const box = label === undefined ? null : labelBox(label, 12, 8);
    expect(box === null ? 0 : box.right - box.left).toBeLessThanOrEqual(170);
  });

  it('gives the scene overlay the chip boxes, and the label boxes only while labels show', () => {
    expect(markBoxes(MARKS, false)).toHaveLength(1);
    expect(markBoxes(MARKS, true)).toHaveLength(2);
  });
});

describe('device chips on a crowded floor', () => {
  const lamp = { id: 'lamp', text: 'Floor lamp', x: 100, y: 100 };
  const fan = { id: 'fan', text: 'Tower fan', x: 112, y: 104 };
  const tv = { id: 'tv', text: 'Television', x: 300, y: 200 };
  const none = { selection: [], hovered: null };

  it('become dots under 45 px per metre where chips would overlap, and only there', () => {
    const dots = deviceMarks([lamp, fan, tv], 30, none).map((mark) => mark.dot);
    expect(dots).toStrictEqual([true, true, false]);
    expect(deviceMarks([lamp, fan, tv], 45, none).some((mark) => mark.dot)).toBe(false);
  });

  it('show the full chip again while selected or hovered', () => {
    const selected = deviceMarks([lamp, fan], 30, { selection: ['lamp'], hovered: null });
    expect(selected.map((mark) => mark.dot)).toStrictEqual([false, true]);
    const hovered = deviceMarks([lamp, fan], 30, { selection: [], hovered: 'fan' });
    expect(hovered.map((mark) => mark.dot)).toStrictEqual([true, false]);
  });

  it('keep a 44 px hit area where the nearest dot wins', () => {
    const marks = deviceMarks([lamp, fan, tv], 30, none);
    expect(nearestDevice(marks, { x: 110, y: 103 })).toBe('fan');
    expect(nearestDevice(marks, { x: 101, y: 100 })).toBe('lamp');
    expect(nearestDevice(marks, { x: 95, y: 121 })).toBe('lamp');
    expect(nearestDevice(marks, { x: 95, y: 123 })).toBeNull();
  });
});
