import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, parse, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { BUTTON_NAME } from '@smarteverything/domain';
import {
  FlipperProtocolUnsupportedError,
  UNKNOWN_BRAND,
  buildPack,
  isSkippableSmartIrError,
  libraryOrder,
  mergeBrands,
  modelTitles,
  readFlipperFile,
  readSmartIrClimate,
  tidyBrand,
  type LibraryIndex,
  type PackedModel,
} from '../src';

const CLIMATE_CATEGORY = 'Air conditioner';

const FLIPPER_CATEGORIES: Readonly<Record<string, string>> = {
  ACs: CLIMATE_CATEGORY,
  Air_Purifiers: 'Air purifier',
  Audio_and_Video_Receivers: 'Audio',
  Bidet: 'Bidet',
  'Blu-Ray': 'Blu-ray player',
  Cable_Boxes: 'Set-top box',
  Cameras: 'Camera',
  Car_Multimedia: 'Car multimedia',
  CCTV: 'CCTV',
  CD_Players: 'CD player',
  Clocks: 'Clock',
  Computers: 'Computer',
  Consoles: 'Console',
  Converters: 'Converter',
  Digital_Signs: 'Digital sign',
  Dust_Collectors: 'Dust collector',
  'DVB-T': 'Set-top box',
  DVD_Players: 'DVD player',
  Fans: 'Fan',
  Fireplaces: 'Fireplace',
  Handicap_Ceiling_Lifts: 'Ceiling lift',
  Head_Units: 'Head unit',
  Heaters: 'Heater',
  Humidifiers: 'Humidifier',
  KVM: 'KVM switch',
  Laserdisc: 'Laserdisc player',
  LED_Lighting: 'Light',
  MiniDisc: 'MiniDisc player',
  Miscellaneous: 'Other',
  Monitors: 'Monitor',
  Multimedia: 'Media player',
  Picture_Frames: 'Picture frame',
  Projectors: 'Projector',
  SoundBars: 'Audio',
  Speakers: 'Audio',
  Streaming_Devices: 'Set-top box',
  Touchscreen_Displays: 'Touchscreen display',
  Toys: 'Toy',
  TVs: 'TV',
  TV_Tuner: 'Set-top box',
  Universal_TV_Remotes: 'Universal TV remote',
  Vacuum_Cleaners: 'Vacuum cleaner',
  VCR: 'VCR',
  Videoconferencing: 'Videoconferencing',
  Whiteboards: 'Whiteboard',
  Window_cleaners: 'Window cleaner',
};

const FLIPPER_EXCLUDED = new Set(['_Converted_', '.git', '.github']);

const ARGUMENTS = parseArgs({
  options: {
    smartir: { type: 'string' },
    'smartir-commit': { type: 'string' },
    flipper: { type: 'string' },
    'flipper-commit': { type: 'string' },
    out: { type: 'string' },
  },
});

function required(name: keyof typeof ARGUMENTS.values): string {
  const value = ARGUMENTS.values[name];
  if (value === undefined) {
    throw new Error(`Pass --${name}.`);
  }
  return value;
}

function categoryOf(folder: string): string {
  const category = FLIPPER_CATEGORIES[folder];
  if (category === undefined) {
    throw new Error(`Flipper-IRDB folder ${folder} has no category; add it to FLIPPER_CATEGORIES.`);
  }
  return category;
}

function smartIrModels(directory: string): { models: PackedModel[]; skipped: string[] } {
  const climate = join(directory, 'codes', 'climate');
  const models: PackedModel[] = [];
  const skipped: string[] = [];
  readdirSync(climate)
    .filter((file) => file.endsWith('.json'))
    .forEach((file) => {
      try {
        const read = readSmartIrClimate(readFileSync(join(climate, file), 'utf8'));
        const brand = tidyBrand(read.brand);
        models.push({
          entry: {
            id: `smartir:climate:${parse(file).name}`,
            source: 'smartir',
            kind: 'climate',
            category: CLIMATE_CATEGORY,
            brand,
            models: modelTitles(brand, CLIMATE_CATEGORY, read.models),
          },
          model: read.climate,
        });
      } catch (error) {
        if (!isSkippableSmartIrError(error)) {
          throw error;
        }
        skipped.push(
          (error instanceof Error ? error.message : String(error)).split(/, received|\(|\n/)[0] ??
            '',
        );
      }
    });
  return { models, skipped };
}

function flipperFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith('.ir'))
    .filter((path) => !FLIPPER_EXCLUDED.has(path.split(sep)[0] ?? ''))
    .sort();
}

function flipperBrands(files: readonly string[]): Set<string> {
  return new Set(
    files
      .map((path) => path.split(sep))
      .filter((parts) => parts.length > 2)
      .map((parts) => tidyBrand(parts[1] ?? '').toLowerCase()),
  );
}

function flipperBrand(path: string, brands: ReadonlySet<string>): string {
  const parts = path.split(sep);
  if (parts.length > 2) {
    return tidyBrand(parts[1] ?? '');
  }
  const first = tidyBrand(basename(path, '.ir').split('_')[0] ?? '');
  return brands.has(first.toLowerCase()) ? first : UNKNOWN_BRAND;
}

function flipperModel(
  directory: string,
  path: string,
  brands: ReadonlySet<string>,
  unsupported: Map<string, number>,
): PackedModel | null {
  const [folder = ''] = path.split(sep);
  const category = categoryOf(folder);
  const brand = flipperBrand(path, brands);
  const file = readFlipperFile(readFileSync(join(directory, path), 'utf8'));
  file.skipped.forEach((error) => {
    const reason =
      error instanceof FlipperProtocolUnsupportedError
        ? error.protocol
        : (error.message
            .replace(/Flipper signal .*? is not/, 'Flipper signal is not')
            .split(', received')[0] ?? '');
    unsupported.set(reason, (unsupported.get(reason) ?? 0) + 1);
  });
  const keys = new Map<string, string>();
  file.signals.forEach((signal) => {
    const name = BUTTON_NAME.safeParse(signal.name);
    if (!name.success) {
      unsupported.set('button name', (unsupported.get('button name') ?? 0) + 1);
    } else if (!keys.has(name.data)) {
      keys.set(name.data, signal.code);
    }
  });
  if (keys.size === 0) {
    return null;
  }
  return {
    entry: {
      id: `flipper:${path.slice(0, -'.ir'.length).split(sep).join('/')}`,
      source: 'flipper-irdb',
      kind: 'keys',
      category,
      brand,
      models: modelTitles(brand, category, [basename(path, '.ir')]),
    },
    model: { kind: 'keys', keys: Object.fromEntries(keys) },
  };
}

function flipperModels(directory: string): {
  models: PackedModel[];
  unsupported: Map<string, number>;
} {
  const unsupported = new Map<string, number>();
  const models: PackedModel[] = [];
  const files = flipperFiles(directory);
  const brands = flipperBrands(files);
  files.forEach((path) => {
    const model = flipperModel(directory, path, brands, unsupported);
    if (model !== null) {
      models.push(model);
    }
  });
  return { models, unsupported };
}

const smartir = smartIrModels(required('smartir'));
const flipper = flipperModels(required('flipper'));
const sources: LibraryIndex['sources'] = [
  { source: 'smartir', licence: 'MIT', commit: required('smartir-commit') },
  { source: 'flipper-irdb', licence: 'CC0-1.0', commit: required('flipper-commit') },
];
const packed = mergeBrands([...smartir.models, ...flipper.models]).sort(libraryOrder);
const pack = buildPack(sources, packed);
const out = required('out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.bin'), pack.index);
writeFileSync(join(out, 'models.bin'), pack.models);
process.stdout.write(
  `${JSON.stringify({
    smartir: smartir.models.length,
    smartirSkipped: Object.fromEntries(
      [...new Set(smartir.skipped)].map((reason) => [
        reason,
        smartir.skipped.filter((one) => one === reason).length,
      ]),
    ),
    flipper: flipper.models.length,
    flipperSkippedSignals: Object.fromEntries(flipper.unsupported),
    indexBytes: pack.index.length,
    modelBytes: pack.models.length,
  })}\n`,
);
