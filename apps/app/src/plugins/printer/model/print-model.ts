import type { PrinterOptions, PrinterPrintOptions } from '@smarteverything/domain';

export interface PrintForm {
  readonly copies: number;
  readonly sides: NonNullable<PrinterPrintOptions['sides']> | null;
  readonly colorMode: string | null;
  readonly quality: NonNullable<PrinterPrintOptions['quality']> | null;
  readonly media: string | null;
  readonly mediaSource: string | null;
  readonly mediaType: string | null;
  readonly orientation: NonNullable<PrinterPrintOptions['orientation']> | null;
  readonly pageRanges: string;
  readonly numberUp: number | null;
  readonly scaling: string | null;
  readonly outputBin: string | null;
  readonly resolution: number | null;
  readonly contentOptimize: string | null;
  readonly priority: number | null;
  readonly holdUntil: string | null;
  readonly finishings: readonly number[];
}

const SIDES = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'] as const;
const QUALITIES = ['draft', 'normal', 'high'] as const;
const ORIENTATIONS = ['portrait', 'landscape', 'reverseLandscape', 'reversePortrait'] as const;

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | null {
  return allowed.find((entry) => entry === value) ?? null;
}

export function sidesOf(value: string | null | undefined): PrintForm['sides'] {
  return oneOf(SIDES, value);
}

export function qualityOf(value: string | null | undefined): PrintForm['quality'] {
  return oneOf(QUALITIES, value);
}

export function orientationOf(value: string | null | undefined): PrintForm['orientation'] {
  return oneOf(ORIENTATIONS, value);
}

function supported(values: readonly string[], wanted: string | null | undefined): string | null {
  return wanted !== null && wanted !== undefined && values.includes(wanted) ? wanted : null;
}

export function initialForm(options: PrinterOptions): PrintForm {
  const { defaults, prefs } = options;
  return {
    copies: prefs.copies ?? defaults.copies ?? 1,
    sides: sidesOf(supported(options.sides, prefs.sides ?? defaults.sides)),
    colorMode: supported(options.colorModes, prefs.colorMode ?? defaults.colorMode),
    quality: qualityOf(supported(options.qualities, prefs.quality ?? defaults.quality)),
    media: supported(options.media, prefs.media ?? defaults.media),
    mediaSource: supported(options.mediaSources, defaults.mediaSource),
    mediaType: supported(options.mediaTypes, defaults.mediaType),
    orientation: orientationOf(supported(options.orientations, defaults.orientation)),
    pageRanges: '',
    numberUp: null,
    scaling: supported(options.scalings, defaults.scaling),
    outputBin: supported(options.outputBins, defaults.outputBin),
    resolution: null,
    contentOptimize: supported(options.contentOptimize, defaults.contentOptimize),
    priority: null,
    holdUntil: null,
    finishings: [],
  };
}

function present<T>(key: string, value: T | null | undefined): Readonly<Record<string, T>> {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function printOptionsOf(form: PrintForm): PrinterPrintOptions {
  const ranges = form.pageRanges.trim();
  return {
    ...(form.copies > 1 ? { copies: form.copies } : {}),
    ...present('sides', form.sides),
    ...present('colorMode', form.colorMode),
    ...present('quality', form.quality),
    ...present('media', form.media),
    ...present('mediaSource', form.mediaSource),
    ...present('mediaType', form.mediaType),
    ...present('orientation', form.orientation),
    ...(ranges === '' ? {} : { pageRanges: ranges }),
    ...present('numberUp', form.numberUp),
    ...present('scaling', form.scaling),
    ...present('outputBin', form.outputBin),
    ...present('resolution', form.resolution),
    ...present('contentOptimize', form.contentOptimize),
    ...present('priority', form.priority),
    ...present('holdUntil', form.holdUntil),
    ...(form.finishings.length === 0 ? {} : { finishings: [...form.finishings] }),
  };
}

const WORDS: Readonly<Record<string, string>> = {
  'one-sided': 'One-sided',
  'two-sided-long-edge': 'Two-sided, flip on long edge',
  'two-sided-short-edge': 'Two-sided, flip on short edge',
  auto: 'Automatic',
  color: 'Colour',
  monochrome: 'Black and white',
  draft: 'Draft',
  normal: 'Normal',
  high: 'High',
  portrait: 'Portrait',
  landscape: 'Landscape',
  reverseLandscape: 'Landscape, reversed',
  reversePortrait: 'Portrait, reversed',
  fit: 'Fit to page',
  fill: 'Fill page',
  'auto-fit': 'Automatic fit',
  none: 'Actual size',
  indefinite: 'Hold until released',
  'day-time': 'Daytime',
  evening: 'Evening',
  night: 'Night',
  weekend: 'Weekend',
  'no-hold': 'Do not hold',
  photo: 'Photo',
  graphic: 'Graphics',
  text: 'Text',
  'text-and-graphic': 'Text and graphics',
};

export function wordOf(value: string): string {
  return WORDS[value] ?? value.replaceAll('-', ' ').replace(/^./u, (first) => first.toUpperCase());
}

const FINISHINGS: Readonly<Record<number, string>> = {
  4: 'Staple',
  5: 'Punch',
  6: 'Cover',
  7: 'Bind',
  8: 'Saddle stitch',
  9: 'Edge stitch',
  10: 'Fold',
  11: 'Trim',
  12: 'Bale',
  13: 'Booklet maker',
  14: 'Jog offset',
};

export function finishingWord(code: number): string {
  return FINISHINGS[code] ?? `Finishing ${String(code)}`;
}

export function choicesOf(
  values: readonly string[],
): readonly { readonly value: string; readonly label: string }[] {
  return values.map((value) => ({ value, label: wordOf(value) }));
}

export function numberChoices(
  values: readonly number[],
): readonly { readonly value: string; readonly label: string }[] {
  return values.map((value) => ({ value: String(value), label: String(value) }));
}
