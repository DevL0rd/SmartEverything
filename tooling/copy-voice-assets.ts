import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('tool.voice-assets');

const root = join(import.meta.dirname, '..');
const require = createRequire(join(root, 'apps', 'hub', 'package.json'));
const manifestName = z.object({ name: z.string() });

export const VOICE_ASSET_PACKAGES = {
  ort: 'onnxruntime-web',
  vad: '@ricky0123/vad-web',
  sherpa: 'sherpa-onnx',
} as const;
export const VOICE_ASSET_PACKAGE_NAMES: readonly string[] = Object.values(VOICE_ASSET_PACKAGES);

export const WAKE_MODEL_DIRECTORY = 'wake-name-model';

const WAKE_MODEL_SOURCES: readonly string[] = [
  join(root, 'apps', 'hub', 'src', 'wake-name', WAKE_MODEL_DIRECTORY),
  join(root, 'apps', 'hub', 'src', 'node', 'ear', WAKE_MODEL_DIRECTORY),
];

const DAVEY_SCOPE = '@snazzah';
const DAVEY_PREFIX = 'davey-';
export const VOICE_ASSET_PREFIX = `${DAVEY_SCOPE}/${DAVEY_PREFIX}`;

const WEB_FILES = {
  ort: [
    'dist/ort.wasm.min.js',
    'dist/ort-wasm-simd-threaded.wasm',
    'dist/ort-wasm-simd-threaded.mjs',
  ],
  vad: ['dist/bundle.min.js', 'dist/vad.worklet.bundle.min.js', 'dist/silero_vad_v6.onnx'],
} as const;
const SERVICE_FILES = {
  ort: ['package.json', 'dist/ort-wasm-simd-threaded.wasm', 'dist/ort-wasm-simd-threaded.mjs'],
  vad: ['package.json', 'dist/silero_vad_v6.onnx'],
} as const;

function packageDirectory(name: string): string {
  let directory = dirname(require.resolve(name));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
      if (manifestName.safeParse(parsed).data?.name === name) return directory;
    }
    directory = dirname(directory);
  }
  throw new Error(`copy-voice-assets could not find the ${name} package folder`);
}

function copy(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  log.debug('asset.copied', () => ({ file: basename(to) }));
}

export function copyWebAssets(out = join(root, 'apps', 'app', 'public', 'vad')): void {
  for (const key of ['ort', 'vad'] as const) {
    const directory = packageDirectory(VOICE_ASSET_PACKAGES[key]);
    for (const file of WEB_FILES[key]) copy(join(directory, file), join(out, basename(file)));
  }
}

function copyPackage(name: string, directory: string, files: readonly string[], to: string): void {
  for (const file of files) copy(join(directory, file), join(to, 'node_modules', name, file));
}

export interface AssetTarget {
  readonly platform: string;
  readonly arch: string;
}

export function copyServiceAssets(
  service = join(root, 'apps', 'desktop', 'dist', 'service'),
  target?: AssetTarget,
): void {
  for (const key of ['ort', 'vad'] as const) {
    const name = VOICE_ASSET_PACKAGES[key];
    copyPackage(name, packageDirectory(name), SERVICE_FILES[key], service);
  }
  const sherpa = packageDirectory(VOICE_ASSET_PACKAGES.sherpa);
  const sherpaFiles = readdirSync(sherpa).filter(
    (file) => file === 'package.json' || /\.(js|wasm)$/.test(file),
  );
  copyPackage(VOICE_ASSET_PACKAGES.sherpa, sherpa, sherpaFiles, service);
  const scope = join(packageDirectory(`${DAVEY_SCOPE}/davey`), '..');
  const daveyPrefix =
    target === undefined ? DAVEY_PREFIX : `${DAVEY_PREFIX}${target.platform}-${target.arch}`;
  for (const name of readdirSync(scope).filter((entry) => entry.startsWith(daveyPrefix))) {
    const directory = join(scope, name);
    const files = readdirSync(directory).filter(
      (file) => file === 'package.json' || file.endsWith('.node'),
    );
    copyPackage(`${DAVEY_SCOPE}/${name}`, directory, files, service);
  }
  for (const wakeModel of WAKE_MODEL_SOURCES) {
    for (const file of readdirSync(wakeModel)) {
      copy(join(wakeModel, file), join(service, WAKE_MODEL_DIRECTORY, file));
    }
  }
}

if (import.meta.main) {
  const [target, directory] = process.argv.slice(2);
  if (target === 'web') copyWebAssets();
  else if (target === 'service') {
    if (directory === undefined) copyServiceAssets();
    else copyServiceAssets(resolve(directory));
  } else {
    throw new Error(`copy-voice-assets needs "web" or "service", got ${String(target)}`);
  }
}
