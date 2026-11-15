import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLanguageData, OcrEngine } from '../../../src/drive/content/ocr';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'drive-ocr-'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

async function picture(words: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="220"><rect width="900" height="220" fill="white"/><text x="20" y="140" font-size="80" font-family="DejaVu Sans" fill="black">${words}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('language data', () => {
  it('copies the bundled English data once and leaves it alone afterwards', async () => {
    await ensureLanguageData(directory, 'eng');
    const file = join(directory, 'eng.traineddata.gz');
    expect(existsSync(file)).toBe(true);
    const first = await readFile(file);
    await ensureLanguageData(directory, 'eng');
    expect((await readFile(file)).equals(first)).toBe(true);
  });

  it('fetches another language once from the pinned package and keeps it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetcher = vi.fn((_url: string) => Promise.resolve(new Response(bytes)));
    vi.stubGlobal('fetch', fetcher);
    await ensureLanguageData(directory, 'deu');
    await ensureLanguageData(directory, 'deu');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\/deu@\d+\.\d+\.\d+\/4\.0\.0_best_int\/deu\.traineddata\.gz$/u,
    );
    expect([...(await readFile(join(directory, 'deu.traineddata.gz')))]).toEqual([1, 2, 3, 4]);
  });

  it('leaves no partial file behind when the download fails', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 404 })));
    await expect(ensureLanguageData(directory, 'xyz')).rejects.toThrow('404');
    expect(await readdir(directory)).toEqual([]);
  });
});

describe('recognising text', () => {
  it('reads the words in a picture and ends up with one clean line', async () => {
    const engine = new OcrEngine(['eng'], directory);
    try {
      expect(await engine.recognize(await picture('Invoice lighthouse'))).toBe(
        'Invoice lighthouse',
      );
      expect(await engine.recognize(await picture('Second harbour'))).toBe('Second harbour');
    } finally {
      await engine.close();
    }
  }, 60_000);

  it('returns an empty string for a picture with no text', async () => {
    const blank = await sharp({
      create: { width: 200, height: 100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const engine = new OcrEngine(['eng'], directory);
    try {
      expect(await engine.recognize(blank)).toBe('');
    } finally {
      await engine.close();
    }
  }, 60_000);
});
