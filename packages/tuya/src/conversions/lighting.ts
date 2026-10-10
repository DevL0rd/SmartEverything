import { z } from 'zod';
import {
  ConversionError,
  chunks,
  decimal,
  hsvToRgb,
  lenientHex,
  pythonRound,
  rgbToHsv,
  strictHex,
  textOf,
  type Converter,
} from './primitives';

const RGB_MARKER = '0168ffff';

interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

function hsvFromRgb(red: number, green: number, blue: number): Hsv {
  const [h, s, v] = rgbToHsv(red / 255, green / 255, blue / 255);
  return {
    h: pythonRound(h * 360, 1),
    s: pythonRound(s * 255, 1),
    v: pythonRound(v * 255, 1),
  };
}

function shortHex(hex: string): number {
  return hex === '' || hex.length > 2 ? 0 : strictHex('dj_v1_hsv_alg', hex);
}

function hsvColour(name: string, precision: number, rgb: (hex: string) => number): Converter {
  return (raw) => {
    const text = textOf(name, raw);
    if (text.slice(6) === RGB_MARKER) {
      return JSON.stringify(
        hsvFromRgb(rgb(text.slice(0, 2)), rgb(text.slice(2, 4)), rgb(text.slice(4, 6))),
      );
    }
    const hue = strictHex(name, text.slice(6, 8)) * 256 + strictHex(name, text.slice(8, 10));
    const saturation = pythonRound(strictHex(name, text.slice(10, 12)) / 255, precision);
    const brightness = pythonRound(strictHex(name, text.slice(12)) / 255, precision);
    return JSON.stringify({
      h: hue,
      s: pythonRound(saturation * 255, 1),
      v: pythonRound(brightness * 255, 1),
    });
  };
}

const djV1Scene: Converter = (raw) => {
  const name = 'dj_v1_scene_alg';
  const text = textOf(name, raw);
  if (text === '') {
    return '';
  }
  const hex = (start: number, end: number, from: string = text): number =>
    strictHex(name, from.slice(start, end));
  hex(6, 8);
  return JSON.stringify({
    frequency: hex(4, 6),
    bright: hex(0, 2),
    temperature: hex(2, 4),
    hsv: chunks(text.slice(8), 6).map((rgb) =>
      hsvFromRgb(hex(0, 2, rgb), hex(2, 4, rgb), hex(4, 6, rgb)),
    ),
  });
};

const djV2Colour: Converter = (raw) => {
  const text = textOf('dj_v2_color_alg', raw);
  const hex = (start: number, end: number): number =>
    lenientHex('dj_v2_color_alg', text.slice(start, end));
  return JSON.stringify({ h: hex(0, 4), s: hex(4, 8), v: hex(8, 12) });
};

function changeMode(flag: number, otherwise: string | null): string | null {
  if (flag === 0) {
    return 'direct';
  }
  return flag === 1 ? 'gradient' : otherwise;
}

function djV2Control(name: string, otherwise: string | null): Converter {
  return (raw) => {
    const text = textOf(name, raw);
    if (text === '') {
      return '';
    }
    const hex = (start: number, end?: number): number => lenientHex(name, text.slice(start, end));
    return JSON.stringify({
      change_mode: changeMode(hex(0, 1), otherwise),
      h: hex(1, 5),
      s: hex(5, 9),
      v: hex(9, 13),
      bright: hex(13, 17),
      temperature: hex(17),
    });
  };
}

const SCENE_MODES: readonly string[] = ['static', 'jump', 'gradient'];

const SCENE_UNIT_WIDTH = 26;

const djV2Scene: Converter = (raw) => {
  const name = 'dj_v2_scene_alg';
  const text = textOf(name, raw);
  const units = text.slice(2);
  const count = Math.floor(units.length / SCENE_UNIT_WIDTH);
  const sceneUnits = Array.from({ length: count }, (_, index) => {
    const item = units.slice(index * SCENE_UNIT_WIDTH, (index + 1) * SCENE_UNIT_WIDTH);
    const hex = (start: number, end?: number): number => lenientHex(name, item.slice(start, end));
    return {
      unit_switch_duration: hex(0, 2),
      unit_gradient_duration: hex(2, 4),
      unit_change_mode: SCENE_MODES[hex(4, 6)] ?? '',
      h: hex(6, 10),
      s: hex(10, 14),
      v: hex(14, 18),
      bright: hex(18, 22),
      temperature: hex(22),
    };
  });
  return JSON.stringify({
    scene_num: 1 + lenientHex(name, text.slice(0, 2)),
    scene_units: sceneUnits,
  });
};

const HSV_TEXT = z.object({
  h: z.union([z.number(), z.string()]),
  s: z.union([z.number(), z.string()]),
  v: z.union([z.number(), z.string()]),
});

function floatOf(name: string, value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (Number.isNaN(parsed) || (typeof value === 'string' && value.trim() === '')) {
    throw new ConversionError(name, `"${String(value)}" is not a number`);
  }
  return parsed;
}

const hbDjV1Colour: Converter = (raw) => {
  const name = 'hb_djv1_color';
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(name, raw));
  } catch (cause) {
    if (cause instanceof ConversionError) {
      throw cause;
    }
    throw new ConversionError(name, `the value is not JSON (${String(cause)})`);
  }
  const colour = HSV_TEXT.safeParse(parsed);
  if (!colour.success) {
    throw new ConversionError(name, 'the value has no h, s and v');
  }
  const rgb = hsvToRgb(
    floatOf(name, colour.data.h) / 360,
    floatOf(name, colour.data.s) / 255,
    floatOf(name, colour.data.v) / 255,
  );
  return rgb.map((component) => Math.trunc(component * 255)).join('|');
};

const hbJsqLight: Converter = (raw) => {
  if (raw === null || raw === undefined) {
    return '';
  }
  return `${textOf('hb_jsq_lightv1', raw)}|0|0`;
};

function pythonInt(name: string, raw: unknown): number {
  if (typeof raw === 'number') {
    return Math.trunc(raw);
  }
  if (typeof raw === 'boolean') {
    return raw ? 1 : 0;
  }
  return decimal(name, textOf(name, raw));
}

interface Range {
  readonly targetMin: number;
  readonly targetMax: number;
  readonly inputMin: number;
  readonly inputMax: number;
}

function rangeOf(name: string, range: Range): Converter {
  return (raw) => {
    if (raw === null || raw === undefined) {
      return '';
    }
    const input = Math.min(Math.max(pythonInt(name, raw), range.inputMin), range.inputMax);
    const scaled = Math.floor(
      ((range.targetMax - range.targetMin) / (range.inputMax - range.inputMin)) *
        (input - range.inputMin) +
        range.targetMin,
    );
    return Math.min(Math.max(scaled, range.targetMin), range.targetMax);
  };
}

export const NULL_PRESERVING_LIGHTING: Readonly<Record<string, Converter>> = {
  dj_v1_hsv_alg: hsvColour('dj_v1_hsv_alg', 3, shortHex),
  voice_atm_color: hsvColour('voice_atm_color', 4, (hex) => strictHex('voice_atm_color', hex)),
  dj_v1_scene_alg: djV1Scene,
  dj_v2_color_alg: djV2Colour,
  dj_v2_contr_alg: djV2Control('dj_v2_contr_alg', ''),
  dj_v2_music_alg: djV2Control('dj_v2_music_alg', null),
  dj_v2_scene_alg: djV2Scene,
  hb_djv1_color: hbDjV1Colour,
};

export const NULL_HANDLING_LIGHTING: Readonly<Record<string, Converter>> = {
  hb_jsq_lightv1: hbJsqLight,
  hb_range_v1: rangeOf('hb_range_v1', {
    targetMin: 0,
    targetMax: 100,
    inputMin: 25,
    inputMax: 255,
  }),
  hb_range_v2: rangeOf('hb_range_v2', {
    targetMin: 1000,
    targetMax: 12000,
    inputMin: 0,
    inputMax: 255,
  }),
};
