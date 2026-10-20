import { z } from 'zod';

const CODE_POINT = z.number().int();

const MODIFIER_KEYSYMS = {
  ctrl: 0xffe3,
  shift: 0xffe1,
  alt: 0xffe9,
  super: 0xffeb,
} as const;

export type KeyModifier = keyof typeof MODIFIER_KEYSYMS;

const MODIFIER_ALIASES: Readonly<Record<string, KeyModifier>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  super: 'super',
  meta: 'super',
  win: 'super',
  windows: 'super',
  cmd: 'super',
  command: 'super',
};

interface NamedKey {
  readonly keysym: number;
  readonly key: string;
}

const NAMED_KEYS: Readonly<Record<string, NamedKey>> = {
  return: { keysym: 0xff0d, key: 'Enter' },
  enter: { keysym: 0xff0d, key: 'Enter' },
  tab: { keysym: 0xff09, key: 'Tab' },
  escape: { keysym: 0xff1b, key: 'Escape' },
  esc: { keysym: 0xff1b, key: 'Escape' },
  backspace: { keysym: 0xff08, key: 'Backspace' },
  delete: { keysym: 0xffff, key: 'Delete' },
  del: { keysym: 0xffff, key: 'Delete' },
  insert: { keysym: 0xff63, key: 'Insert' },
  home: { keysym: 0xff50, key: 'Home' },
  end: { keysym: 0xff57, key: 'End' },
  left: { keysym: 0xff51, key: 'ArrowLeft' },
  up: { keysym: 0xff52, key: 'ArrowUp' },
  right: { keysym: 0xff53, key: 'ArrowRight' },
  down: { keysym: 0xff54, key: 'ArrowDown' },
  pageup: { keysym: 0xff55, key: 'PageUp' },
  page_up: { keysym: 0xff55, key: 'PageUp' },
  pagedown: { keysym: 0xff56, key: 'PageDown' },
  page_down: { keysym: 0xff56, key: 'PageDown' },
  space: { keysym: 0x20, key: ' ' },
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index): [string, NamedKey] => [
      `f${String(index + 1)}`,
      { keysym: 0xffbe + index, key: `F${String(index + 1)}` },
    ]),
  ),
};

const RETURN_KEYSYM = 0xff0d;
const TAB_KEYSYM = 0xff09;
const UNICODE_KEYSYM_BASE = 0x01000000;
const LATIN_START = 0x20;
const LATIN_END = 0x7e;
const LATIN1_START = 0xa0;
const LATIN1_END = 0xff;
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

export class UnknownKeyError extends Error {
  override readonly name = 'UnknownKeyError';

  constructor(readonly received: string) {
    super(
      `Unknown key “${received}”. Use one character, a name such as Return, Tab, Escape, Backspace, Delete, Home, End, Left, Right, Up, Down, PageUp, PageDown, Space or F1 to F12, optionally after modifiers ctrl, shift, alt or super joined with +.`,
    );
  }
}

export class UnsupportedCharacterError extends Error {
  override readonly name = 'UnsupportedCharacterError';

  constructor(readonly codePoint: number) {
    super(
      `The character with code ${String(codePoint)} cannot be typed. Use keys for control keys.`,
    );
  }
}

export interface ParsedKeyCombo {
  readonly modifiers: readonly KeyModifier[];
  readonly keysym: number;
  readonly key: string;
}

function isPrintable(point: number): boolean {
  return (
    (point >= LATIN_START && point <= LATIN_END) || (point >= LATIN1_START && point <= LATIN1_END)
  );
}

function isControl(point: number): boolean {
  return point < LATIN_START || (point > LATIN_END && point < LATIN1_START);
}

function isSurrogate(point: number): boolean {
  return point >= SURROGATE_START && point <= SURROGATE_END;
}

export function keysymOfCodePoint(point: number): number {
  if (point === 0x0a || point === 0x0d) return RETURN_KEYSYM;
  if (point === 0x09) return TAB_KEYSYM;
  if (isControl(point) || isSurrogate(point)) throw new UnsupportedCharacterError(point);
  return isPrintable(point) ? point : UNICODE_KEYSYM_BASE + point;
}

function codePointOf(character: string): number {
  return CODE_POINT.parse(character.codePointAt(0));
}

export function keysymsOfText(text: string): readonly number[] {
  return Array.from(text, (character): number => keysymOfCodePoint(codePointOf(character)));
}

function splitCombo(combo: string): {
  readonly modifiers: readonly string[];
  readonly key: string;
} {
  const plusKey = combo === '+' || combo.endsWith('++');
  const keyStart = plusKey ? combo.length - 1 : combo.lastIndexOf('+') + 1;
  const head = combo.slice(0, Math.max(keyStart - 1, 0));
  return { modifiers: head === '' ? [] : head.split('+'), key: combo.slice(keyStart) };
}

function modifierOf(name: string): KeyModifier {
  const modifier = MODIFIER_ALIASES[name.toLowerCase()];
  if (modifier === undefined) throw new UnknownKeyError(name);
  return modifier;
}

function keyOf(name: string, modified: boolean): { readonly keysym: number; readonly key: string } {
  const named = NAMED_KEYS[name.toLowerCase()];
  if (named !== undefined) return named;
  if (Array.from(name).length !== 1) throw new UnknownKeyError(name);
  const shown = modified ? name.toLowerCase() : name;
  return { keysym: keysymOfCodePoint(codePointOf(shown)), key: shown };
}

export function parseKeyCombo(combo: string): ParsedKeyCombo {
  const { modifiers, key } = splitCombo(combo.trim());
  const parsed = modifiers.map(modifierOf);
  return { modifiers: [...new Set(parsed)], ...keyOf(key, parsed.length > 0) };
}

export function keyComboError(combo: string): string | null {
  try {
    parseKeyCombo(combo);
    return null;
  } catch (cause) {
    return String(Reflect.get(Object(cause), 'message'));
  }
}

export function modifierKeysym(modifier: KeyModifier): number {
  return MODIFIER_KEYSYMS[modifier];
}
