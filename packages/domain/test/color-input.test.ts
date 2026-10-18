import { describe, expect, it } from 'vitest';
import { colorFromInput, kelvinFromText } from '../src';

const RED = { hue: 0, saturation: 100, value: 100 };

describe('reading a colour a person or an AI gives', () => {
  it.each([
    ['#ff0000'],
    ['ff0000'],
    ['red'],
    ['Red'],
    ['rgb(255, 0, 0)'],
    ['255,0,0'],
    ['255, 0, 0'],
    ['{"red": 255, "green": 0, "blue": 0}'],
    ['{"r": 255, "g": 0, "b": 0}'],
    ['[255,0,0]'],
    [{ r: 255, g: 0, b: 0 }],
    [{ red: '255', green: '0', blue: '0' }],
    [[255, 0, 0]],
    [RED],
  ])('reads %j as red', (input) => {
    expect(colorFromInput(input)).toStrictEqual(RED);
  });

  it('reads a coloured name with spaces or dashes', () => {
    expect(colorFromInput('dark-blue')).toStrictEqual(colorFromInput('darkblue'));
    expect(colorFromInput('darkblue')).not.toBeNull();
  });

  it.each([
    ['not a colour'],
    [''],
    ['{broken'],
    ['{"r": 256, "g": 0, "b": 0}'],
    ['1,2'],
    [{ r: 1.5, g: 0, b: 0 }],
    [{ hue: 361, saturation: 0, value: 0 }],
    [42],
    [null],
    [true],
  ])('refuses %j', (input) => {
    expect(colorFromInput(input)).toBeNull();
  });
});

describe('reading a white tone', () => {
  it.each([
    ['2700K', 2700],
    ['2700 k', 2700],
    ['3000 kelvin', 3000],
    ['2700', 2700],
    ['370 mireds', 2703],
    ['250 mired', 4000],
  ])('reads %s as %d kelvin', (text, kelvin) => {
    expect(kelvinFromText(text)).toBe(kelvin);
  });

  it.each([['warm'], ['0 mireds'], ['']])('refuses %j', (text) => {
    expect(kelvinFromText(text)).toBeNull();
  });
});
