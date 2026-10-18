import type { ImageEndpoint, ImageOperationRequest } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import type { z } from 'zod';
import { ImageOperationError } from '../assistant/image/errors';
import { decodeImage, type ImageBytes } from '../assistant/image/media';
import type { OpenRouterClient } from './client';
import { openRouterError, OpenRouterError, readJson } from './errors';
import { IMAGE_EVENT_WIRE, IMAGE_RESPONSE_WIRE } from './image-wire';

const log = new Logger('hub.assistant');
type Usage = Readonly<Record<string, number>>;
export interface ImageProviderResult {
  readonly images: readonly ImageBytes[];
  readonly usage: Usage | null;
  readonly usageSource: 'provider_response' | 'provider_event';
}
export interface ImageProviderInput {
  readonly request: ImageOperationRequest;
  readonly endpoint: ImageEndpoint;
  readonly inputs: readonly { readonly image: ImageBytes }[];
  readonly signal: AbortSignal;
  readonly submitted: () => void;
  readonly usage: (usage: Usage, source: ImageProviderResult['usageSource']) => void;
  readonly preview: (content: Buffer) => Promise<void>;
}
export class OpenRouterImageProvider {
  constructor(private readonly client: OpenRouterClient) {}
  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    const body = imageRequestBody(input);
    input.submitted();
    try {
      return input.request.options.stream
        ? await this.stream(body, input)
        : await this.buffered(body, input);
    } catch (cause) {
      if (cause instanceof OpenRouterError)
        throw new ImageOperationError(
          cause.status !== null || cause.code === 'no_key' ? 'provider' : 'unknown',
          cause.message,
        );
      throw cause;
    }
  }
  private async buffered(body: unknown, input: ImageProviderInput): Promise<ImageProviderResult> {
    const wire = await this.client.image(body, IMAGE_RESPONSE_WIRE, input.signal);
    if (wire.usage !== undefined) input.usage(wire.usage, 'provider_response');
    const decoded = await Promise.all(wire.data.map((item) => readable(item.b64_json)));
    return resultOf(decoded, wire.usage ?? null, 'provider_response');
  }
  private async stream(body: unknown, input: ImageProviderInput): Promise<ImageProviderResult> {
    const decoded: (ImageBytes | null)[] = [];
    let usage: Usage | null = null;
    try {
      for await (const data of this.client.imageEvents(body, input.signal)) {
        const event = eventOf(data);
        if (event.type === 'error')
          throw new ImageOperationError('provider', 'The image provider reported an error.');
        if (event.type === 'image_generation.partial_image') {
          await input.preview(Buffer.from(event.b64_json, 'base64'));
          continue;
        }
        decoded.push(await readable(event.b64_json));
        if (event.usage !== undefined) {
          usage = event.usage;
          input.usage(event.usage, 'provider_event');
        }
      }
    } catch (cause) {
      if (decoded.length === 0 || input.signal.aborted) throw cause;
      log.warn('image.stream_cut_short', {
        completed: decoded.length,
        reason: messageOf(cause),
      });
    }
    return resultOf(decoded, usage, 'provider_event');
  }
}
function imageRequestBody(input: ImageProviderInput): Record<string, unknown> {
  const request = input.request;
  const { stream, n, ...options } = request.options;
  const prompt =
    request.mode === 'edit'
      ? `The first input image is the source to edit. Remaining images are ordered references. ${request.prompt}`
      : request.prompt;
  return {
    model: request.model,
    prompt,
    ...options,
    ...(input.endpoint.parameters['n'] === undefined ? {} : { n }),
    ...(stream ? { stream: true } : {}),
    provider: { only: [request.provider_tag], allow_fallbacks: false },
    ...(input.inputs.length === 0
      ? {}
      : {
          input_references: input.inputs.map(({ image }) => ({
            type: 'image_url',
            image_url: { url: `data:${image.mime};base64,${image.content.toString('base64')}` },
          })),
        }),
  };
}
function eventOf(data: string): z.infer<typeof IMAGE_EVENT_WIRE> {
  const json = readJson(data);
  if (!json.ok) throw openRouterError('unreadable', `an image event wasn’t JSON: ${json.reason}`);
  const parsed = IMAGE_EVENT_WIRE.safeParse(json.value);
  if (!parsed.success)
    throw openRouterError('unreadable', `an image event: ${parsed.error.issues[0]?.message ?? ''}`);
  return parsed.data;
}
async function readable(encoded: string): Promise<ImageBytes | null> {
  try {
    return await decodeImage(encoded);
  } catch (cause) {
    log.warn('image.output_unreadable', {
      reason: messageOf(cause),
    });
    return null;
  }
}
function resultOf(
  decoded: readonly (ImageBytes | null)[],
  usage: Usage | null,
  usageSource: ImageProviderResult['usageSource'],
): ImageProviderResult {
  const images = decoded.filter((image) => image !== null);
  if (images.length === 0)
    throw new ImageOperationError('unknown', 'The provider returned no readable image.');
  return { images, usage, usageSource };
}
