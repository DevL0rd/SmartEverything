import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { z } from 'zod';
import { fsCode } from '../../fs-code';

const DATA_DIRECTORY = '4.0.0_best_int';

const BUNDLED_LANGUAGE = 'eng';

const MIRROR = 'https://cdn.jsdelivr.net/npm';

interface BundledData {
  readonly version: string;
  readonly directory: string;
}

const MANIFEST = z.looseObject({ version: z.string().min(1) });

async function bundledData(): Promise<BundledData> {
  const manifest = createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json');
  const { version } = MANIFEST.parse(JSON.parse(await readFile(manifest, 'utf8')));
  return { version, directory: join(dirname(manifest), DATA_DIRECTORY) };
}

function dataFile(language: string): string {
  return `${language}.traineddata.gz`;
}

async function present(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return false;
    throw cause;
  }
}

async function fetched(url: string, target: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `The OCR language data at ${url} could not be fetched (${String(response.status)}).`,
    );
  }
  const staged = `${target}.${String(process.pid)}.partial`;
  try {
    await writeFile(staged, new Uint8Array(await response.arrayBuffer()));
    await rename(staged, target);
  } catch (cause) {
    await rm(staged, { force: true });
    throw cause;
  }
}

export async function ensureLanguageData(directory: string, language: string): Promise<void> {
  const target = join(directory, dataFile(language));
  if (await present(target)) return;
  await mkdir(directory, { recursive: true });
  const bundled = await bundledData();
  if (language === BUNDLED_LANGUAGE) {
    await copyFile(join(bundled.directory, dataFile(language)), target);
    return;
  }
  await fetched(
    `${MIRROR}/@tesseract.js-data/${language}@${bundled.version}/${DATA_DIRECTORY}/${dataFile(language)}`,
    target,
  );
}

export class OcrEngine {
  private worker: Promise<Worker> | null = null;

  constructor(
    readonly languages: readonly string[],
    private readonly directory: string,
  ) {}

  async recognize(image: Uint8Array): Promise<string> {
    this.worker ??= this.start();
    const worker = await this.worker;
    const { data } = await worker.recognize(Buffer.from(image));
    return data.text.replace(/\s+/gu, ' ').trim();
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (worker !== null) await (await worker).terminate();
  }

  private async start(): Promise<Worker> {
    for (const language of this.languages) await ensureLanguageData(this.directory, language);
    return createWorker([...this.languages], 1, {
      langPath: this.directory,
      gzip: true,
      cacheMethod: 'none',
    });
  }
}
