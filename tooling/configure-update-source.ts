import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { env } from 'node:process';
import { parseArgs } from 'node:util';
import { UPDATE_PUSH_SECRET_BYTES, UPDATE_PUSH_SECRET_FILE } from '@smarteverything/domain';
import { z } from 'zod';
import {
  parseServiceConfigText,
  UPDATE_SOURCE,
  type UpdateSource,
} from '../apps/hub/src/service/configuration.ts';
import { dataRootOf } from './data-root.ts';
import { gitSource } from './hub-update-source.ts';
import { dataLayoutOf } from './release-hub-files.ts';

const OPTIONS = z.strictObject({
  checkout: z.string().refine(isAbsolute, { message: 'must be an absolute path' }),
  data: z.string().min(1).optional(),
  'rotate-push-secret': z.boolean().optional(),
});
const APP_COMMAND = join('tooling', 'self-update-app-command.ts');
const UPSTREAM = /^([^/\s]+)\/(\S+)$/u;

export class ConfigureUpdateSourceError extends Error {
  override readonly name = 'ConfigureUpdateSourceError';
}

async function gitText(
  checkout: string,
  args: readonly string[],
  failure: string,
): Promise<string> {
  const result = await gitSource(checkout, args);
  if (result.code !== 0) throw new ConfigureUpdateSourceError(failure);
  return result.text.trim();
}

export async function updateSourceOf(checkout: string): Promise<UpdateSource> {
  const root = await gitText(
    checkout,
    ['rev-parse', '--show-toplevel'],
    `${checkout} is not the root of a Git checkout.`,
  );
  if (resolve(root) !== resolve(checkout))
    throw new ConfigureUpdateSourceError(`${checkout} is not the root of a Git checkout.`);
  if (!existsSync(join(checkout, APP_COMMAND)))
    throw new ConfigureUpdateSourceError(`${checkout} is not a SmartEverything checkout.`);
  const upstream = await gitText(
    checkout,
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    'The checkout has no upstream branch. Set one with git branch --set-upstream-to.',
  );
  const match = UPSTREAM.exec(upstream);
  const [, remote, branch] = match ?? [];
  return UPDATE_SOURCE.parse({ checkout: resolve(checkout), remote, branch });
}

export async function configureUpdateSource(input: {
  readonly checkout: string;
  readonly data: string;
}): Promise<UpdateSource> {
  const source = await updateSourceOf(input.checkout);
  const file = dataLayoutOf(input.data).system.config.service;
  const current: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const next = JSON.stringify(
    { ...z.record(z.string(), z.unknown()).parse(current), updateSource: source },
    null,
    2,
  );
  parseServiceConfigText(file, next);
  const staged = `${file}.next`;
  writeFileSync(staged, `${next}\n`, { mode: statSync(file).mode });
  renameSync(staged, file);
  return source;
}

export function ensurePushSecret(data: string, rotate: boolean): string | undefined {
  const directory = dataLayoutOf(data).system.updates.selfUpdate;
  const file = join(directory, UPDATE_PUSH_SECRET_FILE);
  if (existsSync(file) && !rotate) return undefined;
  const secret = randomBytes(UPDATE_PUSH_SECRET_BYTES).toString('hex');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const staged = `${file}.next`;
  writeFileSync(staged, `${secret}\n`, { mode: 0o600 });
  renameSync(staged, file);
  return secret;
}

function pushSecretNotice(secret: string | undefined): string {
  return secret === undefined
    ? 'The GitHub push webhook secret is already set. Pass --rotate-push-secret to replace it.\n'
    : `GitHub push webhook secret (shown once, keep it for the webhook settings): ${secret}\n` +
        'In the GitHub repository settings add a webhook with payload URL <the Hub public address>/api/self-update/push, content type application/json, this secret, and the push event only.\n';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      checkout: { type: 'string' },
      data: { type: 'string' },
      'rotate-push-secret': { type: 'boolean' },
    },
  });
  const options = OPTIONS.parse(values);
  const data = await dataRootOf(options.data, env);
  const source = await configureUpdateSource({ checkout: options.checkout, data });
  process.stdout.write(
    `Update source saved: ${source.checkout} (${source.remote}/${source.branch}). Restart the Hub so the source watcher uses it.\n`,
  );
  process.stdout.write(
    pushSecretNotice(ensurePushSecret(data, options['rotate-push-secret'] === true)),
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
