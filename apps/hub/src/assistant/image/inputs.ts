import {
  ApiError,
  IMAGE_INPUT_BYTES_MAX,
  IMAGE_RESOLVED_INPUT,
  type ImageOperationRequest,
  type ImageResolvedInput,
  type ImageSelector,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../../store/repositories/assistant-files';
import type { ImageActor, ImageServiceOptions } from './contract';
import { validateImage, type ImageBytes } from './media';
import { originalBytes } from './original-bytes';

export interface ResolvedImage {
  readonly identity: ImageResolvedInput;
  readonly file: StoredAttachment;
}
export function ownedChat(options: ImageServiceOptions, actor: ImageActor, chatId: string): void {
  actor.authorize('read', chatId);
  const chat = options.store.aiChats.chat(chatId);
  if (chat.profile_id !== actor.profileId)
    throw new ApiError('forbidden', 'This image chat belongs to another profile.');
}
export function resolveImage(
  options: ImageServiceOptions,
  actor: ImageActor,
  chatId: string,
  selection: {
    readonly selector: ImageSelector;
    readonly role: 'source' | 'reference';
    readonly order: number;
  },
): ResolvedImage {
  ownedChat(options, actor, chatId);
  const file = options.repository.resolve(chatId, actor.profileId, selection.selector);
  return {
    file,
    identity: IMAGE_RESOLVED_INPUT.parse({
      attachment_id: file.id,
      role: selection.role,
      order: selection.order,
      sha256: file.sha256,
      mime: file.mime,
      bytes: file.bytes,
    }),
  };
}
export function resolveInputs(
  options: ImageServiceOptions,
  actor: ImageActor,
  request: ImageOperationRequest,
): ResolvedImage[] {
  if (request.mode === 'generate') return [];
  const source =
    request.mode === 'edit'
      ? [
          resolveImage(options, actor, request.chat_id, {
            selector: request.source,
            role: 'source',
            order: 0,
          }),
        ]
      : [];
  const references = request.references.map((selector, index) =>
    resolveImage(options, actor, request.chat_id, {
      selector,
      role: 'reference',
      order: source.length + index,
    }),
  );
  const inputs = [...source, ...references];
  if (new Set(inputs.map((input) => input.file.id)).size !== inputs.length)
    throw new ApiError('invalid_request', 'Select each source or reference image only once.');
  if (inputs.reduce((total, input) => total + input.file.bytes, 0) > IMAGE_INPUT_BYTES_MAX)
    throw new ApiError('invalid_request', 'Selected input images exceed the request byte budget.');
  return inputs;
}
export async function readInputs(
  options: ImageServiceOptions,
  actor: ImageActor,
  chatId: string,
  batch: { readonly inputs: readonly ResolvedImage[]; readonly signal: AbortSignal },
): Promise<readonly { readonly identity: ImageResolvedInput; readonly image: ImageBytes }[]> {
  const result: { readonly identity: ImageResolvedInput; readonly image: ImageBytes }[] = [];
  const { inputs, signal } = batch;
  for (const input of inputs) {
    ownedChat(options, actor, chatId);
    signal.throwIfAborted();
    const path = options.files.pathOf(input.file);
    const content = await originalBytes(path, input.file, signal);
    result.push({
      identity: input.identity,
      image: await validateImage(content, input.file.mime, signal),
    });
  }
  return result;
}
