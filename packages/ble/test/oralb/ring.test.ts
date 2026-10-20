import { describe, expect, it } from 'vitest';
import {
  ORALB_COLOUR_TOLERANCE,
  ORALB_NAMED_COLOURS,
  ORALB_WHITE_DRIVE,
  displayOfDrive,
  ringColourOf,
} from '../../src';
import { gatt } from './fixtures';

describe('the display colour of a drive level', () => {
  it('scales each channel by the white drive and clamps at 255', () => {
    expect(displayOfDrive([0x44, 0xcf, 0x63])).toEqual([255, 255, 255]);
    expect(displayOfDrive([0, 0, 0])).toEqual([0, 0, 0]);
    expect(displayOfDrive([34, 0, 0])).toEqual([128, 0, 0]);
    expect(displayOfDrive([0, 104, 0])).toEqual([0, 128, 0]);
    expect(displayOfDrive([0, 0, 50])).toEqual([0, 0, 129]);
    expect(displayOfDrive([200, 250, 255])).toEqual([255, 255, 255]);
  });

  it('keeps the white drive as the reference', () => {
    expect(ORALB_WHITE_DRIVE).toEqual([0x44, 0xcf, 0x63]);
  });
});

describe('the six named handle colours', () => {
  it.each(gatt().ring)('names $name from its captured drive levels', ({ hex, colour, display }) => {
    const drive: [number, number, number] = [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
    expect(ringColourOf(drive)).toEqual({
      name: colour,
      drive,
      display,
      hex: `#${display.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
    });
  });

  it('lists exactly the six colours', () => {
    expect(Object.keys(ORALB_NAMED_COLOURS)).toEqual([
      'white',
      'yellow',
      'orange',
      'blue',
      'turquoise',
      'pink',
    ]);
  });
});

describe('colours between the named ones', () => {
  it('uses the nearest named colour within the tolerance', () => {
    expect(ringColourOf([0x44 + 5, 0xcf - 5, 0x63]).name).toBe('white');
    expect(ringColourOf([0x80, 0xff - 12, 0]).name).toBe('yellow');
    expect(ringColourOf([0x80, 0xff - 13, 0]).name).toBe('custom');
  });

  it('picks the nearest of two close candidates', () => {
    expect(ringColourOf([0xfc, 0x70, 0], 400).name).toBe('orange');
    expect(ringColourOf([0x80, 0xf0, 0], 400).name).toBe('yellow');
  });

  it('keeps the first named colour when two are equally near', () => {
    expect(ringColourOf([0, 129, 12], 200).name).toBe('white');
  });

  it('calls everything else custom and still gives a display colour', () => {
    const colour = ringColourOf([10, 10, 10]);
    expect(colour.name).toBe('custom');
    expect(colour.display).toEqual([38, 12, 26]);
    expect(colour.hex).toBe('#260C1A');
  });

  it('honours the tolerance argument and its default', () => {
    expect(ORALB_COLOUR_TOLERANCE).toBe(12);
    expect(ringColourOf([0x44, 0xcf, 0x63 + 20]).name).toBe('custom');
    expect(ringColourOf([0x44, 0xcf, 0x63 + 20], 20).name).toBe('white');
    expect(ringColourOf([0x44, 0xcf, 0x63 + 20], 19).name).toBe('custom');
  });

  it('writes the hex in upper case with two digits per channel', () => {
    expect(ringColourOf([0, 0, 1]).hex).toBe('#000003');
  });
});
