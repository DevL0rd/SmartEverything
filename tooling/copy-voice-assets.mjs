import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps', 'hub', 'package.json'));

function packageDirectory(name) {
  let directory = dirname(require.resolve(name));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) {
      return directory;
    }
    directory = dirname(directory);
  }
  throw new Error(`copy-voice-assets could not find the ${name} package folder`);
}

const vadDirectory = packageDirectory('@ricky0123/vad-web');
const ortDirectory = packageDirectory('onnxruntime-web');
const sherpaDirectory = packageDirectory('sherpa-onnx');
const wakeModel = join(root, 'apps', 'hub', 'src', 'wake-name', 'wake-name-model');

const WEB = [
  [ortDirectory, 'dist/ort.wasm.min.js'],
  [ortDirectory, 'dist/ort-wasm-simd-threaded.wasm'],
  [ortDirectory, 'dist/ort-wasm-simd-threaded.mjs'],
  [vadDirectory, 'dist/bundle.min.js'],
  [vadDirectory, 'dist/vad.worklet.bundle.min.js'],
  [vadDirectory, 'dist/silero_vad_v6.onnx'],
];

const SERVICE_MODULES = [
  [ortDirectory, 'onnxruntime-web', 'package.json'],
  [ortDirectory, 'onnxruntime-web', 'dist/ort-wasm-simd-threaded.wasm'],
  [ortDirectory, 'onnxruntime-web', 'dist/ort-wasm-simd-threaded.mjs'],
  [vadDirectory, '@ricky0123/vad-web', 'package.json'],
  [vadDirectory, '@ricky0123/vad-web', 'dist/silero_vad_v6.onnx'],
  ...readdirSync(sherpaDirectory)
    .filter((file) => file === 'package.json' || /\.(js|wasm)$/.test(file))
    .map((file) => [sherpaDirectory, 'sherpa-onnx', file]),
];

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function copyService() {
  const service = join(root, 'apps', 'desktop', 'dist', 'service');
  SERVICE_MODULES.forEach(([directory, name, file]) =>
    copy(join(directory, file), join(service, 'node_modules', name, file)),
  );
  readdirSync(wakeModel).forEach((file) =>
    copy(join(wakeModel, file), join(service, 'wake-name-model', file)),
  );
}

const target = process.argv[2];
if (target === 'web') {
  const out = join(root, 'apps', 'app', 'public', 'vad');
  WEB.forEach(([directory, file]) =>
    copy(join(directory, file), join(out, file.split('/').at(-1))),
  );
} else if (target === 'service') {
  copyService();
} else {
  throw new Error(`copy-voice-assets needs "web" or "service", got ${String(target)}`);
}
