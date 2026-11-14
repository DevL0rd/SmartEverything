import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import type { PinnedDownload } from './build-host-pin.ts';

export class ProvisionError extends Error {
  override readonly name = 'ProvisionError';
}

export type Fetcher = (url: string) => Promise<Response>;

const AR_MAGIC = '!<arch>\n';
const AR_HEADER = 60;
const AR_NAME = 16;
const AR_SIZE_AT = 48;
const AR_SIZE_LENGTH = 10;

export function runChecked(
  program: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly input?: string;
  } = {},
): string {
  const result = spawnSync(program, args, { ...options, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (result.error !== undefined)
    throw new ProvisionError(`${program} could not start: ${result.error.message}`);
  if (result.status !== 0)
    throw new ProvisionError(
      `${basename(program)} ${args.slice(0, 2).join(' ')} failed with exit code ${String(result.status)}: ${(result.stderr || result.stdout).trim().slice(-600)}`,
    );
  return result.stdout;
}

export async function downloadVerified(
  fetcher: Fetcher,
  download: PinnedDownload,
  destination: string,
): Promise<void> {
  const response = await fetcher(download.url);
  if (!response.ok || response.body === null)
    throw new ProvisionError(`${download.url} answered ${String(response.status)}`);
  mkdirSync(dirname(destination), { recursive: true });
  const staged = `${destination}.part`;
  const hash = createHash('sha256');
  const file = openSync(staged, 'w', 0o600);
  try {
    const reader = response.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      const bytes = z.instanceof(Uint8Array).parse(chunk.value);
      hash.update(bytes);
      writeSync(file, bytes);
    }
  } catch (cause) {
    closeSync(file);
    rmSync(staged, { force: true });
    throw cause;
  }
  closeSync(file);
  const actual = hash.digest('hex');
  if (actual !== download.sha256) {
    rmSync(staged, { force: true });
    throw new ProvisionError(
      `${download.url} has SHA-256 ${actual}, not the pinned ${download.sha256}; it was discarded`,
    );
  }
  renameSync(staged, destination);
}

function debDataMember(deb: Buffer): { readonly name: string; readonly body: Buffer } {
  if (deb.subarray(0, AR_MAGIC.length).toString('latin1') !== AR_MAGIC)
    throw new ProvisionError('the Debian package is not an ar archive');
  for (let at = AR_MAGIC.length; at + AR_HEADER <= deb.length;) {
    const name = deb
      .subarray(at, at + AR_NAME)
      .toString('latin1')
      .trim()
      .replace(/\/$/u, '');
    const size = Number(
      deb
        .subarray(at + AR_SIZE_AT, at + AR_SIZE_AT + AR_SIZE_LENGTH)
        .toString('latin1')
        .trim(),
    );
    const body = deb.subarray(at + AR_HEADER, at + AR_HEADER + size);
    if (name.startsWith('data.tar.')) return { name, body };
    at += AR_HEADER + size + (size % 2);
  }
  throw new ProvisionError('the Debian package has no data.tar member');
}

export function extractDebBinary(deb: string, member: string, destination: string): void {
  const data = debDataMember(readFileSync(deb));
  const work = `${destination}.work`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const archive = join(work, data.name);
    writeFileSync(archive, data.body);
    runChecked('tar', ['-xf', archive, '-C', work, `.${member}`]);
    mkdirSync(dirname(destination), { recursive: true });
    chmodSync(join(work, member), 0o755);
    renameSync(join(work, member), destination);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function extractTarball(tarball: string, destination: string): void {
  const staging = `${destination}.staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    runChecked('tar', ['-xzf', tarball, '-C', staging, '--strip-components=1']);
    renameSync(staging, destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
