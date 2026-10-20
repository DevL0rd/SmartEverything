import { describe, expect, it } from 'vitest';
import {
  COMPUTER_FEATURES,
  COMPUTER_INPUT,
  COMPUTER_SCOPES,
  COMPUTER_SCOPES_PATCH,
  COMPUTER_SCOPE_OFF,
  DEFAULT_COMPUTER_SCOPES,
  InputPointError,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  UnknownKeyError,
  UnsupportedCharacterError,
  keyComboError,
  keysymOfCodePoint,
  keysymsOfText,
  MODEL_PICTURE_LONG_EDGE,
  mapPicturePoint,
  modelPictureSize,
  modifierKeysym,
  parseKeyCombo,
  type ScreenRegion,
} from '../src';

describe('COMPUTER_INPUT', () => {
  it('parses every action with its fields', () => {
    const parsed = [
      { action: 'click', x: 10, y: 20 },
      { action: 'double_click', x: 1, y: 2 },
      { action: 'right_click', x: 1, y: 2 },
      { action: 'move', x: 1, y: 2 },
      { action: 'drag', x: 1, y: 2, toX: 30, toY: 40 },
      { action: 'scroll', x: 1, y: 2, dy: 3 },
      { action: 'type', text: 'a£b 😀' },
      { action: 'keys', keys: 'ctrl+l' },
    ].map((input) => COMPUTER_INPUT.parse(input));
    expect(parsed[5]).toEqual({ action: 'scroll', x: 1, y: 2, dx: 0, dy: 3 });
    expect(parsed).toHaveLength(8);
  });

  it('rejects an unknown action, extra fields, negative coordinates and empty text', () => {
    expect(COMPUTER_INPUT.safeParse({ action: 'teleport', x: 1, y: 1 }).success).toBe(false);
    expect(COMPUTER_INPUT.safeParse({ action: 'click', x: 1, y: 1, extra: 1 }).success).toBe(false);
    expect(COMPUTER_INPUT.safeParse({ action: 'click', x: -1, y: 1 }).success).toBe(false);
    expect(COMPUTER_INPUT.safeParse({ action: 'click', x: 1.5, y: 1 }).success).toBe(false);
    expect(COMPUTER_INPUT.safeParse({ action: 'type', text: '' }).success).toBe(false);
  });

  it('refuses a scroll that goes nowhere and a key it does not know, naming the key', () => {
    expect(COMPUTER_INPUT.safeParse({ action: 'scroll', x: 1, y: 1 }).success).toBe(false);
    const unknown = COMPUTER_INPUT.safeParse({ action: 'keys', keys: 'ctrl+Banana' });
    expect(unknown.success).toBe(false);
    expect(JSON.stringify(unknown.error?.issues)).toContain('Banana');
  });

  it('keeps the input scope off by default and reads it from the permissions', () => {
    expect(DEFAULT_COMPUTER_SCOPES.input).toBe(false);
    expect(COMPUTER_SCOPES.shape.input.description).toContain('pointer and keyboard');
    expect(COMPUTER_SCOPE_OFF.input).toContain('turned off');
  });

  it('leaves the input permission alone when a change names only other permissions', () => {
    expect(COMPUTER_SCOPES_PATCH.parse({ files: false })).toEqual({ files: false });
    expect(COMPUTER_SCOPES_PATCH.safeParse({}).success).toBe(false);
    expect(COMPUTER_SCOPES_PATCH.parse({ input: true })).toEqual({ input: true });
  });

  it('carries an input request under the input scope and offers an input feature', () => {
    expect(NODE_REQUEST.parse({ verb: 'input', input: { action: 'click', x: 1, y: 2 } }).verb).toBe(
      'input',
    );
    expect(NODE_VERB_SCOPES.input).toBe('input');
    expect(COMPUTER_FEATURES).toContain('input');
  });
});

describe('key names', () => {
  it('turns characters into keysyms across Latin-1 and beyond', () => {
    expect(keysymOfCodePoint(0x41)).toBe(0x41);
    expect(keysymOfCodePoint(0xe9)).toBe(0xe9);
    expect(keysymOfCodePoint(0x1f600)).toBe(0x01000000 + 0x1f600);
    expect(keysymOfCodePoint(0x20ac)).toBe(0x01000000 + 0x20ac);
    expect(keysymOfCodePoint(0xa0)).toBe(0xa0);
  });

  it('types newline, carriage return and tab as Return and Tab', () => {
    expect(keysymsOfText('a\n\t\r')).toEqual([0x61, 0xff0d, 0xff09, 0xff0d]);
  });

  it('fails loudly for control characters and lone surrogates', () => {
    expect(() => keysymOfCodePoint(0x07)).toThrow(UnsupportedCharacterError);
    expect(() => keysymOfCodePoint(0x7f)).toThrow(UnsupportedCharacterError);
    expect(() => keysymOfCodePoint(0x85)).toThrow(UnsupportedCharacterError);
    expect(() => keysymOfCodePoint(0xd800)).toThrow('cannot be typed');
    expect(() => keysymsOfText('\uD800')).toThrow(UnsupportedCharacterError);
    expect(() => keysymOfCodePoint(0xdfff)).toThrow(UnsupportedCharacterError);
  });

  it('reads combos with modifiers, names, aliases, function keys and single characters', () => {
    expect(parseKeyCombo('ctrl+shift+T')).toEqual({
      modifiers: ['ctrl', 'shift'],
      keysym: 0x74,
      key: 't',
    });
    expect(parseKeyCombo('Return')).toEqual({ modifiers: [], keysym: 0xff0d, key: 'Enter' });
    expect(parseKeyCombo('Enter').keysym).toBe(0xff0d);
    expect(parseKeyCombo('alt+Left')).toMatchObject({ modifiers: ['alt'], key: 'ArrowLeft' });
    expect(parseKeyCombo('CTRL+control+F5')).toMatchObject({ modifiers: ['ctrl'], key: 'F5' });
    expect(parseKeyCombo('F12').keysym).toBe(0xffc9);
    expect(parseKeyCombo('cmd+space')).toMatchObject({ modifiers: ['super'], keysym: 0x20 });
    expect(parseKeyCombo('A')).toMatchObject({ modifiers: [], key: 'A', keysym: 0x41 });
    expect(parseKeyCombo('€').keysym).toBe(0x01000000 + 0x20ac);
    expect(parseKeyCombo(' Tab ').key).toBe('Tab');
  });

  it('reads plus as a key', () => {
    expect(parseKeyCombo('+')).toMatchObject({ modifiers: [], key: '+' });
    expect(parseKeyCombo('ctrl++')).toMatchObject({ modifiers: ['ctrl'], key: '+' });
  });

  it('names the key it does not know', () => {
    expect(() => parseKeyCombo('hyper+a')).toThrow(UnknownKeyError);
    expect(() => parseKeyCombo('ctrl+Banana')).toThrow('“Banana”');
    expect(() => parseKeyCombo('')).toThrow(UnknownKeyError);
    expect(keyComboError('ctrl+l')).toBeNull();
    expect(keyComboError('Banana')).toContain('Banana');
    expect(modifierKeysym('ctrl')).toBe(0xffe3);
    expect(modifierKeysym('shift')).toBe(0xffe1);
  });
});

describe('mapping a picture point to a screen', () => {
  const left: ScreenRegion = { id: 1, x: 0, y: 0, width: 1920, height: 1080 };
  const right: ScreenRegion = { id: 2, x: 1920, y: 180, width: 1280, height: 720 };

  it('lands on the first screen of a two screen desktop', () => {
    const picture = { width: 3200, height: 1080 };
    const mapped = mapPicturePoint(picture, [left, right], { x: 960, y: 540 });
    expect(mapped.region.id).toBe(1);
    expect(mapped.x).toBe(960);
    expect(mapped.y).toBe(540);
  });

  it('lands on a smaller screen with an offset and works out the position inside it', () => {
    const picture = { width: 6400, height: 2160 };
    const mapped = mapPicturePoint(picture, [left, right], { x: 4000, y: 1080 });
    expect(mapped.region.id).toBe(2);
    expect(mapped.x).toBe(80);
    expect(mapped.y).toBe(360);
  });

  it('fails for a point between screens, outside the picture, or with no screens', () => {
    const picture = { width: 3200, height: 1080 };
    expect(() => mapPicturePoint(picture, [left, right], { x: 2000, y: 10 })).toThrow(
      'falls between screens',
    );
    expect(() => mapPicturePoint(picture, [left, right], { x: 3200, y: 10 })).toThrow(
      InputPointError,
    );
    expect(() => mapPicturePoint(picture, [left, right], { x: 10, y: 1080 })).toThrow(
      'outside the 3200x1080 picture',
    );
    expect(() => mapPicturePoint(picture, [], { x: 1, y: 1 })).toThrow('no screen');
  });

  it('keeps the edges of a screen inside it', () => {
    const picture = { width: 1920, height: 1080 };
    expect(mapPicturePoint(picture, [left], { x: 0, y: 0 }).x).toBe(0);
    expect(mapPicturePoint(picture, [left], { x: 1919, y: 1079 }).region.id).toBe(1);
  });
});

describe('the model-sized picture', () => {
  it('never upscales and keeps pictures within the long edge as they are', () => {
    expect(modelPictureSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    expect(modelPictureSize({ width: 1568, height: 900 })).toEqual({ width: 1568, height: 900 });
    expect(modelPictureSize({ width: 800, height: 1568 })).toEqual({ width: 800, height: 1568 });
  });

  it.each([
    [3840, 2160, 1568, 882],
    [2560, 1440, 1568, 882],
    [5120, 1440, 1568, 441],
    [3200, 1080, 1568, 529],
    [1080, 2400, 706, 1568],
  ])('scales %ix%i to %ix%i keeping the shape', (width, height, scaledWidth, scaledHeight) => {
    expect(modelPictureSize({ width, height })).toEqual({
      width: scaledWidth,
      height: scaledHeight,
    });
  });

  it('keeps at least one pixel on the short edge of a very wide picture', () => {
    expect(modelPictureSize({ width: 100_000, height: 10 })).toEqual({
      width: MODEL_PICTURE_LONG_EDGE,
      height: 1,
    });
  });
});
