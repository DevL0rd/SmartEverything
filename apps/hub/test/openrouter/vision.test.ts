import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UsageEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterError } from '../../src/openrouter/errors';
import { bodyOf, contentOf, urlOf, type SentBody } from './photos-transport';
import {
  OpenRouterVision,
  readVisionAnswer,
  VISION_PROMPT,
  visionBody,
  type VisionRequest,
} from '../../src/openrouter/vision';

const IMAGE_PART = z.looseObject({ image_url: z.looseObject({ url: z.string() }) });

const GOOD = {
  caption: 'A dog runs on a beach.',
  scene: 'beach',
  labels: ['dog', 'sand', 'sea'],
  text: '',
  pets: [{ species: 'Dog', box: [100, 200, 600, 700] }],
};

let scratch = '';
let sent: { url: string; body: SentBody }[] = [];
let metered: UsageEntry[] = [];

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'vision-client-'));
  sent = [];
  metered = [];
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function firstContent(): readonly Record<string, unknown>[] {
  const [call] = sent;
  return call === undefined ? [] : contentOf(call.body);
}

function reply(content: unknown, extra: Record<string, unknown> = {}): Response {
  return Response.json({
    id: 'gen-1',
    choices: [
      { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
    ],
    usage: { prompt_tokens: 1400, completion_tokens: 120, cost: 0.0004 },
    ...extra,
  });
}

function clientOf(
  answer: () => Response | Promise<Response>,
  key: string | null = 'key',
): OpenRouterClient {
  const transport: typeof fetch = async (input, init) => {
    sent.push({ url: urlOf(input), body: await bodyOf(init) });
    return answer();
  };
  return new OpenRouterClient({ fetch: transport, key: () => key });
}

function visionOf(client: OpenRouterClient, limit?: number): OpenRouterVision {
  const meter = (entry: UsageEntry): Promise<void> => {
    metered.push(entry);
    return Promise.resolve();
  };
  return limit === undefined
    ? new OpenRouterVision(client, scratch, meter)
    : new OpenRouterVision(client, scratch, meter, limit);
}

function request(extra: Partial<VisionRequest> = {}): VisionRequest {
  return {
    profileId: 'p1',
    itemId: 'item-1',
    model: 'qwen/qwen3.6-35b-a3b',
    mime: 'image/jpeg',
    data: Buffer.from('jpeg-bytes'),
    ...extra,
  };
}

describe('the photo vision client', () => {
  it('asks for strict JSON with zero data retention and no fallbacks', async () => {
    const outcome = await visionOf(clientOf(() => reply(GOOD))).analyse(request());
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call?.body).toMatchObject({
      model: 'qwen/qwen3.6-35b-a3b',
      stream: false,
      temperature: 0,
      provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false },
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'photo_analysis', strict: true },
      },
    });
    const content = firstContent();
    expect(content[0]).toStrictEqual({ type: 'text', text: VISION_PROMPT });
    expect(content[1]).toStrictEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}` },
    });
    expect(outcome.state).toBe('done');
  });

  it('asks for the text in the picture and never for who anyone is', () => {
    expect(VISION_PROMPT).toMatch(/visible text/iu);
    expect(VISION_PROMPT).toMatch(/never name or identify/iu);
  });

  it('returns the analysis with pet boxes as fractions of the picture', async () => {
    const outcome = await visionOf(clientOf(() => reply(GOOD))).analyse(request());
    expect(outcome).toMatchObject({
      state: 'done',
      generationId: 'gen-1',
      analysis: {
        caption: 'A dog runs on a beach.',
        scene: 'beach',
        labels: ['dog', 'sand', 'sea'],
        pets: [{ species: 'dog', box: { x: 0.2, y: 0.1, w: 0.5, h: 0.5 } }],
      },
    });
  });

  it('sends a video as a video part', async () => {
    await visionOf(clientOf(() => reply(GOOD))).analyse(request({ mime: 'video/mp4' }));
    expect(firstContent()[1]).toHaveProperty('video_url');
  });

  it('meters every call as Photos analysis with the reported cost', async () => {
    await visionOf(clientOf(() => reply(GOOD))).analyse(request());
    expect(metered).toHaveLength(1);
    expect(metered[0]).toMatchObject({
      source: 'openrouter',
      work: 'photos',
      profile_id: 'p1',
      model_id: 'qwen/qwen3.6-35b-a3b',
      generation_id: 'gen-1',
      tokens_in: 1400,
      tokens_out: 120,
      cost_micros: 400,
      cost_state: 'reported',
      meta: { kind: 'vision', item_id: 'item-1', cost_usd: 0.0004 },
    });
  });

  it('meters an estimate when the provider reports no usage', async () => {
    const withoutUsage = (): Response =>
      Response.json({ id: 'gen-2', choices: [{ message: { content: JSON.stringify(GOOD) } }] });
    await visionOf(clientOf(withoutUsage)).analyse(request());
    expect(metered[0]).toMatchObject({ cost_micros: 0, cost_state: 'estimated', tokens_in: 0 });
  });

  it('still meters a call whose answer cannot be read', async () => {
    await expect(visionOf(clientOf(() => reply('not json'))).analyse(request())).rejects.toThrow(
      OpenRouterError,
    );
    expect(metered).toHaveLength(1);
  });

  it('waits for a key instead of failing when there is none or it is refused', async () => {
    const none = await visionOf(clientOf(() => reply(GOOD), null)).analyse(request());
    expect(none).toStrictEqual({ state: 'needs_key' });
    expect(sent).toHaveLength(0);
    const refused = await visionOf(
      clientOf(() => Response.json({ error: { message: 'bad key' } }, { status: 401 })),
    ).analyse(request());
    expect(refused).toStrictEqual({ state: 'needs_key' });
    expect(metered).toHaveLength(0);
  });

  it('lets other failures through', async () => {
    const client = clientOf(() =>
      Response.json({ error: { message: 'no credits' } }, { status: 402 }),
    );
    await expect(visionOf(client).analyse(request())).rejects.toMatchObject({ code: 'no_credits' });
  });

  it('refuses media it cannot send', async () => {
    await expect(
      visionOf(clientOf(() => reply(GOOD))).analyse(request({ mime: 'application/pdf' })),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      visionOf(
        clientOf(() => reply(GOOD)),
        4,
      ).analyse(request({ mime: 'application/pdf' })),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('shrinks media that is over the request limit before sending it', async () => {
    const { default: sharp } = await import('sharp');
    const big = await sharp(randomBytes(300 * 300 * 3), {
      raw: { width: 300, height: 300, channels: 3 },
    })
      .png()
      .toBuffer();
    await visionOf(
      clientOf(() => reply(GOOD)),
      big.byteLength - 1,
    ).analyse(request({ mime: 'image/png', data: big }));
    const part = IMAGE_PART.parse(firstContent()[1]);
    expect(part.image_url.url).toMatch(/^data:image\/jpeg;base64,/u);
  });
});

describe('reading the answer', () => {
  it.each([
    ['null content', null],
    ['text that is not JSON', 'sorry'],
    ['a missing field', JSON.stringify({ caption: 'x', scene: 'y', labels: [], text: '' })],
    ['an extra field', JSON.stringify({ ...GOOD, notes: 'hello' })],
    ['a label with a comma', JSON.stringify({ ...GOOD, labels: ['a, b'] })],
    ['an empty caption', JSON.stringify({ ...GOOD, caption: ' ' })],
    [
      'a pet box outside the scale',
      JSON.stringify({ ...GOOD, pets: [{ species: 'cat', box: [0, 0, 1001, 10] }] }),
    ],
    [
      'a pet box without area',
      JSON.stringify({ ...GOOD, pets: [{ species: 'cat', box: [10, 10, 10, 50] }] }),
    ],
    [
      'a pet box of three numbers',
      JSON.stringify({ ...GOOD, pets: [{ species: 'cat', box: [1, 2, 3] }] }),
    ],
  ])('refuses %s', (_name, content) => {
    expect(() => readVisionAnswer(content)).toThrow(OpenRouterError);
  });

  it('accepts a photo with nothing to tag', () => {
    expect(readVisionAnswer(JSON.stringify({ ...GOOD, labels: [], pets: [] }))).toStrictEqual({
      caption: GOOD.caption,
      scene: 'beach',
      labels: [],
      text: null,
      pets: [],
    });
  });
});

describe('the request body', () => {
  it('encodes media across many base64 slices exactly like one whole encoding', async () => {
    const data = randomBytes(2 * 1024 * 1024 + 7);
    const encoded = await visionBody('model/a', { mime: 'image/jpeg', data });
    const body = await bodyOf({ body: encoded.blob });
    const part = IMAGE_PART.parse(contentOf(body)[1]);

    expect(part.image_url.url).toBe(`data:image/jpeg;base64,${data.toString('base64')}`);
    expect(body.model).toBe('model/a');
  });

  it('refuses a model name that carries the media marker', async () => {
    await expect(
      visionBody('smarteverything-media-bytes', { mime: 'image/jpeg', data: randomBytes(4) }),
    ).rejects.toThrow(OpenRouterError);
  });
});
