import type { PlannerResolvedSound } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import type { DesktopRing } from './ring-types.js';

const log = new Logger('desktop.planner-ring');

type FileSound = Extract<PlannerResolvedSound, { kind: 'file' }>;

export type RingSoundSource =
  | { readonly kind: 'tone'; readonly reason: string | null }
  | { readonly kind: 'file'; readonly url: string; readonly name: string }
  | { readonly kind: 'radio'; readonly url: string; readonly name: string };

export type RingSoundDownload = (itemId: string) => Promise<ReadableStream<Uint8Array>>;

export interface RingSoundStore {
  readonly install: (rings: readonly DesktopRing[]) => Promise<void>;
  readonly sourceOf: (sound: PlannerResolvedSound) => Promise<RingSoundSource>;
}

function fileNameOf(sound: FileSound): string {
  const hash = createHash('sha256').update(`${sound.item_id}\n${sound.etag}`).digest('hex');
  const extension = extname(sound.name).toLowerCase();
  return /^\.[a-z0-9]+$/u.test(extension) ? `${hash}${extension}` : hash;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

function filesOf(rings: readonly DesktopRing[]): ReadonlyMap<string, FileSound> {
  const files = new Map<string, FileSound>();
  for (const ring of rings) {
    if (ring.sound.kind === 'file') files.set(fileNameOf(ring.sound), ring.sound);
  }
  return files;
}

export class RingSoundCache implements RingSoundStore {
  readonly #folder: string;
  readonly #download: RingSoundDownload;
  readonly #failed = new Map<string, string>();

  constructor(folder: string, download: RingSoundDownload) {
    this.#folder = folder;
    this.#download = download;
  }

  install = async (rings: readonly DesktopRing[]): Promise<void> => {
    const files = filesOf(rings);
    await mkdir(this.#folder, { recursive: true });
    await this.#prune(new Set(files.keys()));
    for (const [name, sound] of files) await this.#fetch(name, sound);
    log.info('planner_ring.sounds_installed', { files: files.size, failed: this.#failed.size });
  };

  sourceOf = async (sound: PlannerResolvedSound): Promise<RingSoundSource> => {
    if (sound.kind === 'tone') return { kind: 'tone', reason: null };
    if (sound.kind === 'radio') return { kind: 'radio', url: sound.url, name: sound.name };
    const name = fileNameOf(sound);
    const path = join(this.#folder, name);
    if (await exists(path))
      return { kind: 'file', url: pathToFileURL(path).href, name: sound.name };
    const failure = this.#failed.get(name);
    const reason =
      failure === undefined
        ? `${sound.name} has not finished downloading to this computer.`
        : `${sound.name} could not be downloaded to this computer.`;
    log.warn('planner_ring.sound_missing', { reason: failure ?? 'not_downloaded' });
    return { kind: 'tone', reason };
  };

  async #prune(wanted: ReadonlySet<string>): Promise<void> {
    for (const entry of await readdir(this.#folder)) {
      if (!wanted.has(entry)) await rm(join(this.#folder, entry), { force: true });
    }
    for (const name of [...this.#failed.keys()]) {
      if (!wanted.has(name)) this.#failed.delete(name);
    }
  }

  async #fetch(name: string, sound: FileSound): Promise<void> {
    const path = join(this.#folder, name);
    if (await exists(path)) return;
    const partial = `${path}.part`;
    try {
      const body = await this.#download(sound.item_id);
      await pipeline(Readable.fromWeb(body), createWriteStream(partial));
      await rename(partial, path);
      this.#failed.delete(name);
      log.info('planner_ring.sound_downloaded');
    } catch (cause) {
      await rm(partial, { force: true });
      this.#failed.set(name, messageOf(cause));
      log.warn('planner_ring.sound_download_failed', { reason: messageOf(cause) });
    }
  }
}
