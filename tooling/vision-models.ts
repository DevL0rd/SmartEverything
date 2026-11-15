import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('tool.vision-models');

const root = join(import.meta.dirname, '..');

export const VISION_ASSETS = join(root, 'apps', 'hub', 'assets', 'vision');

export const VISION_PIN = z
  .strictObject({
    directory: z.string().min(1),
    models: z
      .array(
        z.strictObject({
          file: z.string().min(1),
          url: z.url(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/u),
          bytes: z.int().positive(),
          license: z.string().min(1),
          source: z.url(),
        }),
      )
      .min(1),
  })
  .readonly();

export type VisionPin = z.infer<typeof VISION_PIN>;

export class VisionModelHashError extends Error {
  override readonly name = 'VisionModelHashError';

  constructor(
    readonly file: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`${file} hashes to ${received} where ${expected} is pinned.`);
  }
}

export function readVisionPin(): VisionPin {
  return VISION_PIN.parse(
    JSON.parse(readFileSync(join(import.meta.dirname, 'vision-models', 'pin.json'), 'utf8')),
  );
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function modelIsPresent(directory: string, model: VisionPin['models'][number]): boolean {
  const path = join(directory, model.file);
  return existsSync(path) && sha256Of(readFileSync(path)) === model.sha256;
}

async function download(model: VisionPin['models'][number], directory: string): Promise<void> {
  const response = await fetch(model.url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok)
    throw new Error(`Fetching ${model.url} failed with HTTP ${String(response.status)}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const received = sha256Of(bytes);
  if (received !== model.sha256) throw new VisionModelHashError(model.file, model.sha256, received);
  const target = join(directory, model.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(`${target}.part`, bytes);
  renameSync(`${target}.part`, target);
  log.debug('model.fetched', { file: model.file, bytes: bytes.length });
}

export async function ensureVisionModels(directory: string = VISION_ASSETS): Promise<void> {
  const pin = readVisionPin();
  for (const model of pin.models)
    if (!modelIsPresent(directory, model)) await download(model, directory);
}

export function stageVisionModels(service: string, source: string = VISION_ASSETS): void {
  const pin = readVisionPin();
  for (const model of pin.models) {
    if (!modelIsPresent(source, model))
      throw new Error(
        `${model.file} is missing or does not match its pin in ${source}; run pnpm run build:vision-models.`,
      );
    const target = join(service, pin.directory, model.file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, model.file), target);
  }
}

if (import.meta.main) {
  await ensureVisionModels();
  process.stdout.write(`Vision models are in ${VISION_ASSETS}.\n`);
}
