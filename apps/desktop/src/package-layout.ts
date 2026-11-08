export const COMPUTER_DIRECTORY = 'computer';
export const COMPUTER_ENTRY = 'computer.mjs';

export const DESKTOP_INSTALLATION_RESOURCES = [
  'app.asar',
  'dist/index.html',
  `${COMPUTER_DIRECTORY}/${COMPUTER_ENTRY}`,
  'computer/ear-process.mjs',
  'computer/loop-watchdog.mjs',
  'computer/hook-helper.mjs',
  'computer/drive-blocks.mjs',
  'computer/wake-name-model/decoder.int8.onnx',
  'computer/wake-name-model/encoder.int8.onnx',
  'computer/wake-name-model/joiner.int8.onnx',
  'computer/wake-name-model/tokens.txt',
] as const;

export const DESKTOP_LINUX_RESOURCES = [
  'computer/drive-mount/se-drive-mount',
  'computer/drive-mount/LICENSE.go-fuse.txt',
] as const;

export const DESKTOP_PACKAGE_RESOURCES = [
  ...DESKTOP_INSTALLATION_RESOURCES,
  'computer/wake-name-model/bpe.vocab',
] as const;

export const COMPUTER_PAIRING_WINDOW_TOKEN = 'SMARTEVERYTHING_COMPUTER_PAIRING_WINDOW_TOKEN';
