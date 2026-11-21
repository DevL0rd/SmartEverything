import type { PhotoErase, UsageEntry } from '@smarteverything/domain';
import sharp, { type Metadata } from 'sharp';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterClient } from '../../../src/openrouter/client';
import { OpenRouterError } from '../../../src/openrouter/errors';
import { OpenRouterEraser } from '../../../src/photos/edits/eraser-openrouter';
import { PHOTO_AI_DEFAULT_MODELS } from '../../../src/photos/ai/defaults';
import {
  ERASE_PROMPT,
  MODEL_EDGE,
  brushDiameter,
  eraseStrokes,
  eraseWindow,
  maskOf,
  type Eraser,
} from '../../../src/photos/edits/eraser';
import { applyGeometry } from '../../../src/photos/edits/geometry';
import { imageOf, rasterOf } from '../../../src/photos/edits/raster';
import { pixelAt, quadrants, rawOf } from './edit-fixture';
import { urlOf } from '../../openrouter/photos-transport';

const GREY = { r: 120, g: 120, b: 120 };

const STROKES: PhotoErase['strokes'] = [
  {
    size: 0.1,
    points: [
      { x: 0.4, y: 0.5 },
      { x: 0.6, y: 0.5 },
    ],
  },
];

async function base(width: number, height: number): Promise<ReturnType<typeof rasterOf>> {
  return rasterOf(sharp(await quadrants(width, height, [GREY, GREY, GREY, GREY])));
}

describe('the erase window', () => {
  it('surrounds the strokes with context and stays inside the photo', () => {
    const window = eraseWindow(STROKES, 400, 200);
    expect(brushDiameter(STROKES[0] ?? { size: 0, points: [] }, 400, 200)).toBe(20);
    expect(window.left).toBeLessThan(150);
    expect(window.left + window.width).toBeGreaterThan(250);
    expect(window.top).toBeGreaterThanOrEqual(0);
    expect(window.top + window.height).toBeLessThanOrEqual(200);
    const edge = eraseWindow([{ size: 0.5, points: [{ x: 0, y: 0 }] }], 400, 200);
    expect(edge.left).toBe(0);
    expect(edge.top).toBe(0);
  });

  it('draws the brush as white on black, one dot for a single point', async () => {
    const full = await base(400, 200);
    const window = eraseWindow(STROKES, 400, 200);
    const mask = await maskOf(STROKES, window, full);
    expect(mask.length).toBe(window.width * window.height);
    const centre = (100 - window.top) * window.width + (200 - window.left);
    expect(mask[centre]).toBe(255);
    expect(mask[0]).toBe(0);
    const dot = await maskOf(
      [{ size: 0.2, points: [{ x: 0.5, y: 0.5 }] }],
      { left: 0, top: 0, width: 400, height: 200 },
      full,
    );
    expect(dot[100 * 400 + 200]).toBe(255);
    expect(dot[0]).toBe(0);
  });
});

interface Sent {
  readonly crop: Metadata;
  readonly mask: Metadata;
}

const MAGENTA = (): Promise<Buffer> =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 0, b: 255 } } })
    .png()
    .toBuffer();

function maskLevel(
  mask: Buffer,
  window: ReturnType<typeof eraseWindow>,
  at: { readonly x: number; readonly y: number },
): number {
  const wx = at.x - window.left;
  const wy = at.y - window.top;
  const inside = wx >= 0 && wy >= 0 && wx < window.width && wy < window.height;
  return inside ? (mask[wy * window.width + wx] ?? 0) : 0;
}

function pixelBytes(raster: { readonly data: Buffer }, x: number, y: number): Buffer {
  const at = (y * 400 + x) * 4;
  return raster.data.subarray(at, at + 4);
}

function checkPlacement(
  placed: { readonly data: Buffer },
  full: { readonly data: Buffer },
  brush: { readonly mask: Buffer; readonly window: ReturnType<typeof eraseWindow> },
): number {
  let inside = 0;
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 400; x += 1) {
      const level = maskLevel(brush.mask, brush.window, { x, y });
      if (level === 0) {
        expect(pixelBytes(placed, x, y)).toStrictEqual(pixelBytes(full, x, y));
      }
      if (level === 255) {
        inside += 1;
        expect(Array.from(pixelBytes(placed, x, y))).toStrictEqual([255, 0, 255, 255]);
      }
    }
  }
  return inside;
}

describe('erasing strokes', () => {
  it('sends a downscaled crop and mask and builds a patch that changes only the brushed pixels', async () => {
    const full = await base(400, 200);
    const seen: Sent[] = [];
    const eraser: Eraser = {
      erase: async (request) => {
        seen.push({
          crop: await sharp(request.crop).metadata(),
          mask: await sharp(request.mask).metadata(),
        });
        return MAGENTA();
      },
    };
    const patch = await eraseStrokes(full, {
      eraser,
      profileId: 'p',
      itemId: 'i',
      strokes: STROKES,
      signal: AbortSignal.timeout(10_000),
    });
    const [sent] = seen;
    expect(sent?.crop.width).toBe(sent?.mask.width);
    expect(Math.max(sent?.crop.width ?? 0, sent?.crop.height ?? 0)).toBeLessThanOrEqual(MODEL_EDGE);
    const placed = await applyGeometry(
      full,
      [{ kind: 'patch', patchId: patch.patchId, box: patch.box }],
      () => Promise.resolve(patch.png),
    );
    expect([placed.width, placed.height]).toStrictEqual([400, 200]);
    const window = eraseWindow(STROKES, 400, 200);
    const mask = await maskOf(STROKES, window, full);
    const inside = checkPlacement(placed, full, { mask, window });
    expect(inside).toBeGreaterThan(100);
    const reread = await rawOf(await imageOf(placed).png().toBuffer());
    expect(pixelAt(reread, 0, 0)).toStrictEqual(GREY);
  });
});

describe('the OpenRouter eraser', () => {
  const PNG = async (): Promise<string> =>
    (
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .png()
        .toBuffer()
    ).toString('base64');

  function clientOf(answer: () => Promise<Response>, sent: unknown[]): OpenRouterClient {
    const transport: typeof fetch = async (input, init) => {
      const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      sent.push({ url: urlOf(input), body });
      return answer();
    };
    return new OpenRouterClient({ fetch: transport, key: () => 'key' });
  }

  const REQUEST = {
    profileId: 'p',
    itemId: 'i',
    crop: Buffer.from([1, 2, 3]),
    mask: Buffer.from([4, 5]),
  };

  it('asks the zero retention image route with the crop and mask and meters the cost', async () => {
    const sent: unknown[] = [];
    const metered: UsageEntry[] = [];
    const eraser = new OpenRouterEraser(
      clientOf(
        async () =>
          Response.json({
            data: [{ b64_json: await PNG() }],
            usage: { cost: 0.04, input_tokens: 900, output_tokens: 1290 },
          }),
        sent,
      ),
      (entry) => {
        metered.push(entry);
        return Promise.resolve();
      },
      () => Promise.resolve(PHOTO_AI_DEFAULT_MODELS.eraser),
    );
    const answer = await eraser.erase(REQUEST, AbortSignal.timeout(10_000));
    expect((await sharp(answer).metadata()).width).toBe(8);
    const SENT = z.looseObject({
      url: z.string(),
      body: z.looseObject({
        model: z.string(),
        prompt: z.string(),
        n: z.number(),
        input_references: z.array(z.unknown()).length(2),
        provider: z.looseObject({
          zdr: z.literal(true),
          data_collection: z.literal('deny'),
          allow_fallbacks: z.literal(false),
        }),
      }),
    });
    const parsed = SENT.parse(sent[0]);
    expect(parsed.url).toMatch(/\/images$/u);
    expect(parsed.body.model).toBe('google/gemini-3.1-flash-lite-image');
    expect(parsed.body.prompt).toBe(ERASE_PROMPT);
    expect(metered).toHaveLength(1);
    expect(metered[0]).toMatchObject({
      work: 'photos',
      profile_id: 'p',
      model_id: PHOTO_AI_DEFAULT_MODELS.eraser,
      cost_micros: 40_000,
      cost_state: 'reported',
      tokens_in: 900,
      tokens_out: 1290,
      meta: { kind: 'erase', item_id: 'i' },
    });
  });

  it('meters an unknown cost as estimated and refuses an empty or unreadable answer', async () => {
    const metered: UsageEntry[] = [];
    const ok = new OpenRouterEraser(
      clientOf(async () => Response.json({ data: [{ b64_json: await PNG() }] }), []),
      (entry) => {
        metered.push(entry);
        return Promise.resolve();
      },
      () => Promise.resolve(PHOTO_AI_DEFAULT_MODELS.eraser),
    );
    await ok.erase(REQUEST, AbortSignal.timeout(10_000));
    expect(metered[0]).toMatchObject({
      cost_micros: 0,
      cost_state: 'estimated',
      meta: { usage_available: false },
    });
    const broken = new OpenRouterEraser(
      clientOf(
        () =>
          Promise.resolve(
            Response.json({ data: [{ b64_json: Buffer.from('nope').toString('base64') }] }),
          ),
        [],
      ),
      () => Promise.resolve(),
      () => Promise.resolve(PHOTO_AI_DEFAULT_MODELS.eraser),
    );
    await expect(broken.erase(REQUEST, AbortSignal.timeout(10_000))).rejects.toThrow();
  });

  it('turns an OpenRouter failure into an upstream failure', async () => {
    const eraser = new OpenRouterEraser(
      clientOf(
        () => Promise.resolve(Response.json({ error: { message: 'no' } }, { status: 402 })),
        [],
      ),
      () => Promise.resolve(),
      () => Promise.resolve(PHOTO_AI_DEFAULT_MODELS.eraser),
    );
    const failure = await eraser
      .erase(REQUEST, AbortSignal.timeout(10_000))
      .catch((cause: unknown) => cause);
    expect(failure).not.toBeInstanceOf(OpenRouterError);
    expect(failure).toMatchObject({ code: 'upstream_failed' });
  });
});
