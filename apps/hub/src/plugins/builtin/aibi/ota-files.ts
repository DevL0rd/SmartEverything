import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, posix } from 'node:path';
import { z } from 'zod';
import { AIBI_HOST } from './host-name';
import type { Json, PatchedFirmware } from './ota-offer';

const FIRMWARE_FOLDER = 'firmware';
const PATCHED_FOLDER = 'patched';
const METADATA_FILE = 'ota-metadata.json';
const LATEST_FILE = 'latest-firmware.json';
const PATCHED_METADATA = 'metadata.json';
const PATCHED_SUFFIX = '-patched.zip';
const DOWNLOAD_TIMEOUT_MS = 120_000;
const NAME_MAX = 80;
const FORWARDED_HEADERS = ['authorization', 'secret', 'user-agent'] as const;
const DEFAULT_ORIGINAL = 'https://local/aibi/version/public/0/unknown/unknown/firmware.zip';

class FirmwareDownloadError extends Error {
  override readonly name = 'FirmwareDownloadError';

  constructor(readonly status: number) {
    super(`Firmware download failed (HTTP ${String(status)})`);
  }
}

const UPDATE = z.object({
  firmware: z.union([z.string(), z.number()]).optional(),
  url: z.union([z.string(), z.number()]).optional(),
  versionNum: z.union([z.string(), z.number()]).optional(),
  versionName: z.union([z.string(), z.number()]).optional(),
  responseTag: z.union([z.string(), z.number()]).optional(),
});

const LATEST = z.object({ update: UPDATE.optional() });

function textOf(value: string | number | undefined, fallback = ''): string {
  return value === undefined ? fallback : String(value);
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

async function readJson(path: string): Promise<unknown> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parsed;
  } catch (cause) {
    if (missing(cause) || cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
}

async function listOptional(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    if (missing(cause)) {
      return [];
    }
    throw cause;
  }
}

function firmwareFolder(folder: string): string {
  return join(folder, FIRMWARE_FOLDER);
}

async function patchedFirmware(folder: string): Promise<PatchedFirmware | null> {
  const patched = join(firmwareFolder(folder), PATCHED_FOLDER);
  const name = (await listOptional(patched))
    .filter((file) => file.endsWith(PATCHED_SUFFIX))
    .sort()
    .at(-1);
  if (name === undefined) {
    return null;
  }
  const latest = LATEST.safeParse(await readJson(join(firmwareFolder(folder), LATEST_FILE)));
  const fallback = UPDATE.safeParse(await readJson(join(patched, PATCHED_METADATA)));
  const update =
    (latest.success ? latest.data.update : undefined) ?? (fallback.success ? fallback.data : {});
  const original =
    textOf(update.firmware) || new URL(textOf(update.url, DEFAULT_ORIGINAL)).pathname;
  const file = join(patched, name);
  const bytes = await readFile(file);
  return {
    file,
    name,
    urlPath: posix.join(dirname(original.startsWith('/') ? original : `/${original}`), name),
    versionNum: textOf(update.versionNum),
    versionName: textOf(update.versionName, name.replace(/-patched\.zip$/, '')),
    responseTag: textOf(update.responseTag, 'otares'),
    md5: createHash('md5').update(bytes).digest('hex'),
    bytes,
  };
}

async function stamp(path: string): Promise<string> {
  try {
    const info = await stat(path);
    return `${String(info.mtimeMs)}:${String(info.size)}`;
  } catch (cause) {
    if (missing(cause)) {
      return 'none';
    }
    throw cause;
  }
}

async function signatureOf(folder: string): Promise<string> {
  const patched = join(firmwareFolder(folder), PATCHED_FOLDER);
  const names = (await listOptional(patched))
    .filter((file) => file.endsWith(PATCHED_SUFFIX))
    .sort();
  const last = names.at(-1);
  const stamps = await Promise.all([
    last === undefined ? 'none' : stamp(join(patched, last)),
    stamp(join(firmwareFolder(folder), LATEST_FILE)),
    stamp(join(patched, PATCHED_METADATA)),
  ]);
  return [...names, ...stamps].join('|');
}

export class PatchedFirmwareCache {
  private kept: { readonly signature: string; readonly value: PatchedFirmware | null } | null =
    null;

  constructor(private readonly folder: string) {}

  async get(): Promise<PatchedFirmware | null> {
    const signature = await signatureOf(this.folder);
    if (this.kept?.signature !== signature) {
      this.kept = { signature, value: await patchedFirmware(this.folder) };
    }
    return this.kept.value;
  }
}

export async function rememberOffer(folder: string, json: Json): Promise<void> {
  await mkdir(firmwareFolder(folder), { recursive: true });
  await writeFile(
    join(firmwareFolder(folder), METADATA_FILE),
    `${JSON.stringify(json, null, 2)}\n`,
  );
}

function forwardedHeaders(
  url: URL,
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  if (url.hostname !== AIBI_HOST) {
    return {};
  }
  return Object.fromEntries(
    FORWARDED_HEADERS.flatMap((name) => {
      const value = headers[name];
      return value === undefined || value === '' ? [] : [[name, value]];
    }),
  );
}

export async function downloadFirmware(
  folder: string,
  url: string,
  headers: Readonly<Record<string, string>>,
): Promise<{ readonly file: string; readonly bytes: number }> {
  const target = new URL(url);
  const response = await fetch(url, {
    headers: forwardedHeaders(target, headers),
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new FirmwareDownloadError(response.status);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const safe =
    basename(target.pathname)
      .replace(/[^\w.-]/g, '_')
      .slice(0, NAME_MAX) || 'firmware';
  const type = response.headers.get('content-type') ?? '';
  const suffix = extname(safe) === '' ? (type.includes('zip') ? '.zip' : '.bin') : '';
  const file = join(firmwareFolder(folder), `${String(Date.now())}-${safe}${suffix}`);
  await mkdir(firmwareFolder(folder), { recursive: true });
  await writeFile(file, bytes);
  return { file, bytes: bytes.length };
}
