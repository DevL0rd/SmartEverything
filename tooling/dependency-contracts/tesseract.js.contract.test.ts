import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const ENGLISH = z
  .strictObject({ code: z.literal('eng'), gzip: z.boolean(), langPath: z.string().min(1) })
  .parse(createRequire(repositoryFile('apps/hub/package.json'))('@tesseract.js-data/eng'));

const WIDTH = 900;
const HEIGHT = 200;

function pageWith(text: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(WIDTH)}" height="${String(HEIGHT)}"><rect width="${String(WIDTH)}" height="${String(HEIGHT)}" fill="white"/><text x="30" y="125" font-size="90" font-family="sans-serif" fill="black">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('tesseract.js contract', () => {
  let worker: Worker;

  beforeAll(async () => {
    worker = await createWorker('eng', 1, {
      langPath: ENGLISH.langPath,
      gzip: ENGLISH.gzip,
      cacheMethod: 'none',
    });
  }, 60_000);

  afterAll(async () => {
    await worker.terminate();
  });

  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'tesseract.js')).toBe(installedVersion('tesseract.js'));
  });

  it('reads the words of a rendered PNG from the bundled English data without the network', async () => {
    const { data } = await worker.recognize(await pageWith('Invoice 4821'));
    expect(data.text.trim()).toBe('Invoice 4821');
    expect(data.confidence).toBeGreaterThan(60);
  }, 60_000);

  it('finds no text in a blank page', async () => {
    const blank = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const { data } = await worker.recognize(blank);
    expect(data.text.trim()).toBe('');
  }, 60_000);

  it('serves several images from one worker in turn', async () => {
    const first = await worker.recognize(await pageWith('Receipt'));
    const second = await worker.recognize(await pageWith('Passport'));
    expect(first.data.text.trim()).toBe('Receipt');
    expect(second.data.text.trim()).toBe('Passport');
  }, 60_000);
});
