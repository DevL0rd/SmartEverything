import { z } from 'zod';
import type { PhotoBox } from '@smarteverything/domain';
import type { OpenRouterClient } from './client';
import { openRouterError, OpenRouterError, readJson } from './errors';
import { REQUEST_BYTES_MAX, requestTimeoutMs, shrinkMedia } from './media-shrink';
import { PHOTOS_PROVIDER, photosUsageEntry, type PhotosMeter } from './photos-usage';
import { OR_USAGE, type OrUsage } from './wire';

export const VISION_PROMPT = [
  'Look at this photo or video for a private photo library and fill in the JSON.',
  'caption: one plain sentence saying what it shows.',
  'scene: the kind of place or occasion in one to three words, such as "beach", "kitchen", "birthday party".',
  'labels: every distinct object, animal, food, activity, landmark and setting a person would search for, each one to three lowercase words, no commas, most prominent first.',
  'pets: one entry for each cat, dog or other pet, with its species in lowercase and its box as [ymin, xmin, ymax, xmax] in whole numbers from 0 to 1000 relative to the picture.',
  'Never name or identify any person.',
].join(' ');

const PET_BOX = z
  .tuple([
    z.int().min(0).max(1000),
    z.int().min(0).max(1000),
    z.int().min(0).max(1000),
    z.int().min(0).max(1000),
  ])
  .refine(([top, left, bottom, right]) => bottom > top && right > left, {
    message: 'a pet box has area',
  });

const LABEL = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^,]+$/u, 'a label has no comma');

const NAME = z.string().trim().min(1);

const ANALYSIS_WIRE = z.strictObject({
  caption: NAME,
  scene: NAME,
  labels: z.array(LABEL),
  pets: z.array(z.strictObject({ species: NAME, box: PET_BOX })),
});

export interface VisionPet {
  readonly species: string;
  readonly box: PhotoBox;
}

export interface VisionAnalysis {
  readonly caption: string;
  readonly scene: string;
  readonly labels: readonly string[];
  readonly pets: readonly VisionPet[];
}

export interface VisionRequest {
  readonly profileId: string;
  readonly itemId: string | null;
  readonly model: string;
  readonly mime: string;
  readonly data: Buffer;
  readonly signal?: AbortSignal;
}

export type VisionOutcome =
  | { readonly state: 'needs_key' }
  | {
      readonly state: 'done';
      readonly analysis: VisionAnalysis;
      readonly usage: OrUsage | null;
      readonly generationId: string | null;
    };

const RESPONSE_BYTES_MAX = 256 * 1024;
const MAX_ANSWER_TOKENS = 2048;

const ANSWER = z.object({
  id: z.string().min(1).max(200),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).length(1),
  usage: OR_USAGE.extend({ cost: z.number().nonnegative().nullish() }).nullish(),
});

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'photo_analysis',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['caption', 'scene', 'labels', 'pets'],
      properties: {
        caption: { type: 'string' },
        scene: { type: 'string' },
        labels: { type: 'array', items: { type: 'string', pattern: '^[^,]+$' } },
        pets: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['species', 'box'],
            properties: {
              species: { type: 'string' },
              box: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
            },
          },
        },
      },
    },
  },
} as const;

const SCALE = 1000;

function mediaPart(media: {
  readonly mime: string;
  readonly data: Buffer;
}): Record<string, unknown> {
  const url = `data:${media.mime};base64,${media.data.toString('base64')}`;
  if (media.mime.startsWith('image/')) return { type: 'image_url', image_url: { url } };
  if (media.mime.startsWith('video/')) return { type: 'video_url', video_url: { url } };
  throw openRouterError('bad_request', `unsupported photo media type ${media.mime}`);
}

function boxOf([top, left, bottom, right]: readonly [number, number, number, number]): PhotoBox {
  return {
    x: left / SCALE,
    y: top / SCALE,
    w: (right - left) / SCALE,
    h: (bottom - top) / SCALE,
  };
}

export function readVisionAnswer(content: string | null): VisionAnalysis {
  if (content === null) throw openRouterError('unreadable', 'photo analysis has no content');
  const json = readJson(content);
  if (!json.ok) throw openRouterError('unreadable', `photo analysis was not JSON: ${json.reason}`);
  const parsed = ANALYSIS_WIRE.safeParse(json.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue === undefined ? '' : ` ${issue.path.join('.')}: ${issue.message}`;
    throw openRouterError('unreadable', `photo analysis${where}`);
  }
  return {
    caption: parsed.data.caption,
    scene: parsed.data.scene,
    labels: parsed.data.labels,
    pets: parsed.data.pets.map((pet) => ({
      species: pet.species.toLowerCase(),
      box: boxOf(pet.box),
    })),
  };
}

function requestBody(
  model: string,
  media: { readonly mime: string; readonly data: Buffer },
): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: 'user', content: [{ type: 'text', text: VISION_PROMPT }, mediaPart(media)] },
    ],
    stream: false,
    usage: { include: true },
    temperature: 0,
    max_tokens: MAX_ANSWER_TOKENS,
    reasoning: { enabled: false },
    response_format: RESPONSE_FORMAT,
    provider: PHOTOS_PROVIDER,
  };
}

export function needsKey(cause: unknown): boolean {
  return (
    cause instanceof OpenRouterError && (cause.code === 'no_key' || cause.code === 'unauthorized')
  );
}

export class OpenRouterVision {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly tmp: string,
    private readonly meter: PhotosMeter,
    private readonly requestBytesMax: number = REQUEST_BYTES_MAX,
  ) {}

  async analyse(request: VisionRequest): Promise<VisionOutcome> {
    try {
      return await this.run(request);
    } catch (cause) {
      if (needsKey(cause)) return { state: 'needs_key' };
      throw cause;
    }
  }

  private async media(request: VisionRequest): Promise<{ mime: string; data: Buffer }> {
    if (request.data.byteLength <= this.requestBytesMax) return request;
    const smaller = await shrinkMedia(this.tmp, request.data, request.mime, this.requestBytesMax);
    if (smaller === undefined)
      throw openRouterError('bad_request', 'photo media is too large to analyse in one request');
    return smaller;
  }

  private async run(request: VisionRequest): Promise<VisionOutcome> {
    const media = await this.media(request);
    const answer = await this.client.retrying(
      (signal) =>
        this.client.json(
          {
            path: '/chat/completions',
            method: 'POST',
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(requestTimeoutMs(media.data.byteLength)),
            ]),
            responseBytesMax: RESPONSE_BYTES_MAX,
            body: requestBody(request.model, media),
          },
          ANSWER,
          'photo analysis',
        ),
      request.signal,
    );
    const [choice] = answer.choices;
    if (choice === undefined) throw openRouterError('unreadable', 'photo analysis has no choice');
    const usage = answer.usage ?? null;
    this.meter(
      photosUsageEntry({
        profileId: request.profileId,
        model: request.model,
        usage,
        generationId: answer.id,
        kind: 'vision',
        itemId: request.itemId,
      }),
    );
    return {
      state: 'done',
      analysis: readVisionAnswer(choice.message.content),
      usage,
      generationId: answer.id,
    };
  }
}
