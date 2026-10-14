import {
  IMAGE_OUTPUT_BYTES_MAX,
  type ImageOperationRequest,
  type ImageEndpoint,
  type ImageResolvedInput,
} from '@smarteverything/domain';
import { ImageOperationError } from '../assistant/image/errors';
import { decodeImage, type ImageBytes } from '../assistant/image/media';
import { boundedBody, boundedText, IMAGE_RESPONSE_LIMIT, parseImageJson } from './image-response';
import { imageStream } from './image-stream';
import {
  IMAGE_EVENT_WIRE,
  IMAGE_RESPONSE_WIRE,
  IMAGE_RESPONSE_USAGE_WIRE,
  IMAGE_COMPLETED_USAGE_WIRE,
} from './image-wire';
import type { ImageFetch } from './image-catalog';

export interface ImageProviderResult {
  readonly images: readonly ImageBytes[];
  readonly usage: Readonly<Record<string, number>> | null;
  readonly usageSource: 'provider_response' | 'provider_event';
}
export interface ImageProviderInput {
  readonly request: ImageOperationRequest;
  readonly endpoint: ImageEndpoint;
  readonly inputs: readonly { readonly identity: ImageResolvedInput; readonly image: ImageBytes }[];
  readonly signal: AbortSignal;
  readonly authorize: () => void;
  readonly submitted: () => void;
  readonly usage: (
    usage: Readonly<Record<string, number>>,
    source: 'provider_response' | 'provider_event',
  ) => void;
  readonly preview: (image: ImageBytes) => Promise<void>;
}
export class OpenRouterImageProvider {
  constructor(
    private readonly options: { readonly fetch: ImageFetch; readonly key: () => string | null },
  ) {}
  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    const key = this.options.key();
    if (key === null)
      throw new ImageOperationError('provider', 'Configure an OpenRouter image-provider key.');
    const body = imageRequestBody(input);
    input.signal.throwIfAborted();
    input.authorize();
    input.submitted();
    let response: Response;
    try {
      response = await this.options.fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        redirect: 'error',
        signal: input.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
      });
    } catch (cause) {
      if (input.signal.aborted)
        throw new ImageOperationError(
          'cancelled',
          'Image request cancelled; billing is unverified.',
        );
      throw new ImageOperationError(
        'unknown',
        cause instanceof Error
          ? 'The image provider connection failed after submission; delivery is unknown.'
          : 'Image submission delivery is unknown.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImageOperationError('provider', `Image provider HTTP ${String(response.status)}.`);
    }
    return input.request.options.stream ? this.stream(response, input) : buffered(response, input);
  }
  private async stream(
    response: Response,
    input: ImageProviderInput,
  ): Promise<ImageProviderResult> {
    if (response.body === null)
      throw new ImageOperationError('unknown', 'Image stream has no body.');
    const images: ImageBytes[] = [];
    let usage: Readonly<Record<string, number>> | null = null;
    for await (const data of imageStream(response.body, input.signal)) {
      if (data === '[DONE]') {
        if (images.length === 0)
          throw new ImageOperationError('unknown', 'Image stream ended without a completed image.');
        return { images, usage, usageSource: 'provider_event' };
      }
      const decoded = parseImageJson(data);
      const reported = retainImageUsage(decoded, input, 'provider_event');
      const event = IMAGE_EVENT_WIRE.parse(decoded);
      if (event.type === 'error')
        throw new ImageOperationError('provider', 'The image provider reported an error.');
      const image = await decodeImage(event.b64_json, event.media_type, input.signal);
      if (event.type === 'image_generation.partial_image') await input.preview(image);
      else {
        images.push(image);
        enforceOutput(images, input.request.options.n);
        usage = reported ?? usage;
      }
    }
    throw new ImageOperationError('unknown', 'The image stream did not finish.');
  }
}
function imageRequestBody(input: ImageProviderInput): string {
  const request = input.request;
  const { stream, n, ...options } = request.options;
  const prompt =
    request.mode === 'edit'
      ? `The first input image is the source to edit. Remaining images are ordered references. ${request.prompt}`
      : request.prompt;
  return boundedBody({
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
  });
}
async function buffered(
  response: Response,
  input: ImageProviderInput,
): Promise<ImageProviderResult> {
  const decoded = parseImageJson(await boundedText(response, IMAGE_RESPONSE_LIMIT, input.signal));
  const usage = retainImageUsage(decoded, input, 'provider_response');
  const wire = IMAGE_RESPONSE_WIRE.parse(decoded);
  const images: ImageBytes[] = [];
  for (const item of wire.data)
    images.push(await decodeImage(item.b64_json, item.media_type, input.signal));
  enforceOutput(images, input.request.options.n);
  return { images, usage, usageSource: 'provider_response' };
}
function retainImageUsage(
  decoded: unknown,
  input: ImageProviderInput,
  source: ImageProviderResult['usageSource'],
): Readonly<Record<string, number>> | null {
  const schema =
    source === 'provider_event' ? IMAGE_COMPLETED_USAGE_WIRE : IMAGE_RESPONSE_USAGE_WIRE;
  const result = schema.safeParse(decoded);
  if (!result.success || result.data.usage === undefined) return null;
  input.usage(result.data.usage, source);
  return result.data.usage;
}
function enforceOutput(images: readonly ImageBytes[], count: number): void {
  if (
    images.length > count ||
    images.reduce((total, image) => total + image.content.length, 0) > IMAGE_OUTPUT_BYTES_MAX
  )
    throw new ImageOperationError(
      'limit',
      'The provider returned too many image bytes or results.',
    );
}
