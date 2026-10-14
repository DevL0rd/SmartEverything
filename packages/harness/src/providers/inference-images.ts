import { Context } from '@deepseek-ai/cordis';
import {
  AttachmentStore,
  ImageVariantId,
  requestImageDimensions,
} from '@deepseek-ai/dsh-attachment';
import type {
  ImageAttachmentRef,
  ImageAttachmentLimits,
  ImageRequestTarget,
  RequestImageAttachment,
  SaveImageAttachment,
  StoredImageAttachment,
} from '@deepseek-ai/dsh-attachment';
import type { GenerateOptions, ImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import {
  SUBSCRIPTION_INFERENCE_IMAGE,
  SUBSCRIPTION_INFERENCE_IMAGE_REF,
} from '@smarteverything/domain';
import type { SubscriptionInferenceImage } from '@smarteverything/domain';
import { REQUEST_IMAGE_PIXEL_BUDGET, REQUEST_IMAGE_MAX_BYTES } from './pi-delegate';
import type { SubscriptionAttachmentOptions } from './pi-delegate';
import { SubscriptionProviderError } from './errors';

const IMAGE_IDENTITY = SUBSCRIPTION_INFERENCE_IMAGE_REF.omit({ name: true });

export async function inferenceImages(
  options: GenerateOptions,
  attachments: SubscriptionAttachmentOptions,
): Promise<SubscriptionInferenceImage[]> {
  const refs = imageReferences(options);
  if (refs.size === 0) return [];
  const store = attachments.resolveAttachments?.();
  if (store === undefined)
    throw new SubscriptionProviderError(
      'CAPABILITY_UNAVAILABLE',
      'Remote image inference requires its execution attachment service.',
    );
  const images: SubscriptionInferenceImage[] = [];
  for (const { ref, retained } of refs.values()) {
    const target = {
      ...requestImageDimensions(ref.width, ref.height, REQUEST_IMAGE_PIXEL_BUDGET),
      maxBytes: REQUEST_IMAGE_MAX_BYTES,
    };
    const image = retained ? await store.readImageRequest(ref, target, options.signal) : undefined;
    const access = attachments.resolveImageAccess?.(store, ref);
    images.push(
      SUBSCRIPTION_INFERENCE_IMAGE.parse({
        ref,
        ...(image === undefined ? {} : { request: encodeImage(image, target) }),
        ...(access === undefined ? {} : { access }),
      }),
    );
  }
  return images;
}

export class InferenceImages extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits = {
    maxImageBytes: 20 * 1024 * 1024,
    maxImagesPerMessage: 100,
    maxMessageImageBytes: 20 * 1024 * 1024,
    maxImagePixels: REQUEST_IMAGE_PIXEL_BUDGET,
    maxImageDimension: 2048,
    mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  };
  constructor(private readonly images: readonly SubscriptionInferenceImage[]) {
    super(new Context());
  }
  validateImage(_input: SaveImageAttachment): Promise<void> {
    return Promise.reject(this.unavailable());
  }
  saveImage(_input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    return Promise.reject(this.unavailable());
  }
  readImage(_ref: ImageAttachmentRef): Promise<StoredImageAttachment> {
    return Promise.reject(this.unavailable());
  }
  override readImageRequest(
    ref: ImageAttachmentRef,
    target: ImageRequestTarget,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment> {
    signal?.throwIfAborted();
    const image = this.find(ref).request;
    if (image === undefined) throw this.unavailable();
    if (JSON.stringify(image.target) !== JSON.stringify(target))
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        'Supplier image policy differs from the execution request.',
      );
    const data = Buffer.from(image.data, 'base64');
    if (data.byteLength !== image.bytes)
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        'Forwarded image bytes differ from the exact execution variant.',
      );
    return Promise.resolve({
      ...image,
      attachment: ref,
      data,
      variantId: ImageVariantId(image.variantId),
    });
  }
  access(ref: ImageAttachmentRef): ImageAttachmentAccess | undefined {
    return this.find(ref).access;
  }
  private find(ref: ImageAttachmentRef): SubscriptionInferenceImage {
    const image = this.images.find((item) => sameImageIdentity(item.ref, ref));
    if (image === undefined)
      throw new SubscriptionProviderError(
        'CAPABILITY_UNAVAILABLE',
        'The execution host did not supply this model image.',
      );
    return image;
  }
  private unavailable(): SubscriptionProviderError {
    return new SubscriptionProviderError(
      'CAPABILITY_UNAVAILABLE',
      'A model supplier has no attachment storage or filesystem authority.',
    );
  }
}

function imageReferences(
  options: GenerateOptions,
): ReadonlyMap<string, { readonly ref: ImageAttachmentRef; readonly retained: boolean }> {
  const refs = new Map<string, { readonly ref: ImageAttachmentRef; readonly retained: boolean }>();
  for (const message of options.messages)
    for (const block of message.content)
      if (block.type === 'image') {
        const previous = refs.get(block.attachment.attachmentId);
        if (previous !== undefined && !sameImageIdentity(previous.ref, block.attachment))
          throw new SubscriptionProviderError(
            'CAPABILITY_UNAVAILABLE',
            'Repeated model image identity has conflicting immutable metadata.',
          );
        refs.set(block.attachment.attachmentId, {
          ref: block.attachment,
          retained: block.offloaded !== true || previous?.retained === true,
        });
      }
  return refs;
}
function encodeImage(
  image: RequestImageAttachment,
  target: ImageRequestTarget,
): NonNullable<SubscriptionInferenceImage['request']> {
  return {
    variantId: image.variantId,
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    depth: image.depth,
    space: image.space,
    hasAlpha: image.hasAlpha,
    data: Buffer.from(image.data).toString('base64'),
    target,
  };
}

function sameImageIdentity(
  left: SubscriptionInferenceImage['ref'],
  right: SubscriptionInferenceImage['ref'],
): boolean {
  const { name: _leftName, ...leftIdentity } = left;
  const { name: _rightName, ...rightIdentity } = right;
  return (
    JSON.stringify(IMAGE_IDENTITY.parse(leftIdentity)) ===
    JSON.stringify(IMAGE_IDENTITY.parse(rightIdentity))
  );
}
