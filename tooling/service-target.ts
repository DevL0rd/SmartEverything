import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { WAKE_MODEL_DIRECTORY } from './copy-voice-assets.ts';
import {
  archOfElfMachine,
  ELF_MACHINE_BY_ARCH,
  elfMachine,
  type GlibcVersion,
  highestGlibc,
  isNewerGlibc,
  isWasmModule,
} from './native-binary.ts';
import { ServiceRuntimeError } from './service-runtime.ts';

const log = new Logger('tool.service-target');

export const SERVICE_TARGET_NAME = z.enum(['linux-x64', 'linux-arm64']);
export type ServiceTargetName = z.infer<typeof SERVICE_TARGET_NAME>;

export interface ServiceTarget {
  readonly platform: 'linux';
  readonly arch: 'x64' | 'arm64';
}

const TARGETS: Readonly<Record<ServiceTargetName, ServiceTarget>> = {
  'linux-x64': { platform: 'linux', arch: 'x64' },
  'linux-arm64': { platform: 'linux', arch: 'arm64' },
};

export const OLDEST_SUPPORTED_GLIBC: GlibcVersion = [2, 31];

const CLAUDE_SDK = '@anthropic-ai/claude-agent-sdk';
export const SHARP_WASM = '@img/sharp-wasm32';
export const SHARP_NATIVE = /^@img\/sharp-(?!wasm32$)/u;
const WAKE_MODEL_FILES = [
  'encoder.int8.onnx',
  'decoder.int8.onnx',
  'joiner.int8.onnx',
  'tokens.txt',
  'bpe.vocab',
];
const FFMPEG_PACKAGE = 'ffmpeg-static';
const GO2RTC_DIRECTORY = 'go2rtc';

export class ServiceTargetError extends Error {
  override readonly name = 'ServiceTargetError';

  constructor(
    readonly target: ServiceTargetName,
    readonly problems: readonly string[],
  ) {
    super(
      `The service bundle does not fit ${target}:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
    );
  }
}

export function serviceTarget(name: ServiceTargetName): ServiceTarget {
  return TARGETS[name];
}

export function targetIsHost(target: ServiceTarget): boolean {
  return target.platform === process.platform && target.arch === process.arch;
}

function filesUnder(directory: string, suffix: string): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(entry.parentPath, entry.name));
}

function machineProblem(directory: string, file: string, target: ServiceTarget): string[] {
  const shown = relative(directory, file);
  const machine = elfMachine(file);
  if (machine === undefined) return [`${shown} is not a little-endian ELF binary`];
  if (machine === ELF_MACHINE_BY_ARCH[target.arch]) return [];
  const built = archOfElfMachine(machine);
  return [`${shown} is built for ${built ?? `ELF machine ${String(machine)}`}, not ${target.arch}`];
}

function glibcProblem(directory: string, file: string): string[] {
  const needed = highestGlibc(file);
  if (needed === undefined || !isNewerGlibc(needed, OLDEST_SUPPORTED_GLIBC)) return [];
  const limit = OLDEST_SUPPORTED_GLIBC.join('.');
  return [`${relative(directory, file)} needs glibc ${needed.join('.')}, newer than ${limit}`];
}

function nativeAddonProblems(directory: string, target: ServiceTarget): string[] {
  return filesUnder(join(directory, 'node_modules'), '.node').flatMap((file) => [
    ...machineProblem(directory, file, target),
    ...glibcProblem(directory, file),
  ]);
}

function requiredFile(directory: string, file: string, target: ServiceTarget): string[] {
  const path = join(directory, file);
  if (!existsSync(path)) return [`${file} is missing`];
  return [...machineProblem(directory, path, target), ...glibcProblem(directory, path)];
}

function requiredNativeFiles(directory: string, target: ServiceTarget): string[] {
  const davey = `davey-${target.platform}-${target.arch}-gnu`;
  return [
    ...requiredFile(
      directory,
      join('node_modules', '@snazzah', davey, `davey.${target.platform}-${target.arch}-gnu.node`),
      target,
    ),
    ...requiredFile(
      directory,
      join('node_modules', `${CLAUDE_SDK}-${target.platform}-${target.arch}`, 'claude'),
      target,
    ),
  ];
}

function sharpProblems(directory: string): string[] {
  const modules = join(directory, 'node_modules');
  const scope = join(modules, '@img');
  const native = (existsSync(scope) ? readdirSync(scope) : [])
    .filter((name) => SHARP_NATIVE.test(`@img/${name}`))
    .sort();
  const portable = existsSync(join(modules, SHARP_WASM, 'index.cjs'));
  return [
    ...native.map((name) => `@img/${name} ships although sharp is bundled as WebAssembly`),
    ...(portable ? [] : [`${SHARP_WASM} is missing, so sharp cannot load`]),
  ];
}

function wasmProblems(directory: string): string[] {
  return filesUnder(join(directory, 'node_modules'), '.wasm')
    .filter((file) => !isWasmModule(file))
    .map((file) => `${relative(directory, file)} is not a WebAssembly module`);
}

function wakeModelProblems(directory: string): string[] {
  const model = join(directory, WAKE_MODEL_DIRECTORY);
  return WAKE_MODEL_FILES.filter((file) => !existsSync(join(model, file))).map(
    (file) => `${join(WAKE_MODEL_DIRECTORY, file)} is missing`,
  );
}

function binaryProblems(directory: string, target: ServiceTarget): string[] {
  return [
    ...requiredFile(directory, join('node_modules', FFMPEG_PACKAGE, 'ffmpeg'), target),
    ...requiredFile(directory, join(GO2RTC_DIRECTORY, 'go2rtc'), target),
  ];
}

export interface VerifyOptions {
  readonly binaries: boolean;
}

export function serviceTargetProblems(
  directory: string,
  target: ServiceTarget,
  options: VerifyOptions,
): readonly string[] {
  return [
    ...new Set([
      ...nativeAddonProblems(directory, target),
      ...requiredNativeFiles(directory, target),
      ...sharpProblems(directory),
      ...wasmProblems(directory),
      ...wakeModelProblems(directory),
      ...(options.binaries ? binaryProblems(directory, target) : []),
    ]),
  ];
}

const SMOKE_SCRIPT = `
  import { createRequire } from 'node:module';
  const { native } = JSON.parse(process.argv[1]);
  const require = createRequire(process.cwd() + '/service.mjs');
  const sherpa = require('sherpa-onnx');
  if (typeof sherpa.createKws !== 'function') throw new Error('sherpa-onnx has no keyword spotter');
  const OpusScript = require('opusscript');
  const opus = new OpusScript(48000, 1, OpusScript.Application.AUDIO);
  if (opus.encode(Buffer.alloc(1920), 960).length === 0) throw new Error('opusscript encoded nothing');
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 8, height: 4, channels: 3, background: '#808080' } }).png().toBuffer();
  const info = await sharp(png).resize(4).raw().toBuffer({ resolveWithObject: true });
  if (info.info.width !== 4) throw new Error('sharp did not resize');
  require.resolve('onnxruntime-web/ort-wasm-simd-threaded.wasm');
  require.resolve('@ricky0123/vad-web/dist/silero_vad_v6.onnx');
  const { DatabaseSync } = await import('node:sqlite');
  new DatabaseSync(':memory:').close();
  if (native) require('@snazzah/davey');
`;

export function smokeLoadedPackages(directory: string, target: ServiceTarget): void {
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', SMOKE_SCRIPT, JSON.stringify({ native: targetIsHost(target) })],
    { cwd: directory, encoding: 'utf8' },
  );
  log.debug('smoke.packages_loaded', () => ({
    exitCode: result.status,
    nativeLoaded: targetIsHost(target),
    durationMs: Date.now() - started,
  }));
  if (result.status !== 0)
    throw new ServiceRuntimeError(
      `The shipped packages did not load (exit ${String(result.status)}):\n${result.stderr.slice(0, 2000)}`,
    );
}

export function verifyServiceTarget(
  directory: string,
  name: ServiceTargetName,
  options: VerifyOptions,
): void {
  const target = serviceTarget(name);
  const problems = serviceTargetProblems(directory, target, options);
  log.debug('target.checked', () => ({ target: name, problems: problems.length, ...options }));
  if (problems.length > 0) throw new ServiceTargetError(name, problems);
  smokeLoadedPackages(directory, target);
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    options: { target: { type: 'string' }, binaries: { type: 'boolean' } },
    allowPositionals: true,
  });
  const [directory] = positionals;
  if (directory === undefined) throw new ServiceRuntimeError('verify-service needs the directory');
  verifyServiceTarget(directory, SERVICE_TARGET_NAME.parse(values.target), {
    binaries: values.binaries === true,
  });
  process.stdout.write(`${directory} fits ${String(values.target)}.\n`);
}
