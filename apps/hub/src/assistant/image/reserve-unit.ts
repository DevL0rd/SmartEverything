import {
  ApiError,
  IMAGE_INPUT_BYTES_MAX,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_RESOLVED_INPUT,
  type ImageEndpoint,
  type ImageOperationOrigin,
  type ImageOperationReceipt,
  type ImageOperationRequest,
  type ImageResolvedInput,
  type ImageSelector,
} from '@smarteverything/domain';
import { admitOptions } from '../../openrouter/image-options';
import type { StoredAttachment } from '../../store/repositories/assistant-files';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';

export interface ResolvedImage {
  readonly identity: ImageResolvedInput;
  readonly file: StoredAttachment;
}

function resolveImage(
  store: HostStore,
  input: ImageReservation,
  selection: {
    readonly selector: ImageSelector;
    readonly role: 'source' | 'reference';
    readonly order: number;
  },
): ResolvedImage {
  const chat = store.aiChats.chat(input.request.chat_id);
  if (chat.profile_id !== input.profileId)
    throw new ApiError('forbidden', 'This image chat belongs to another profile.');
  const file = store.imageOperations.resolve(chat.id, input.profileId, selection.selector);
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

function resolveInputs(store: HostStore, input: ImageReservation): ResolvedImage[] {
  const { request } = input;
  if (request.mode === 'generate') return [];
  const source =
    request.mode === 'edit'
      ? [resolveImage(store, input, { selector: request.source, role: 'source', order: 0 })]
      : [];
  const references = request.references.map((selector, index) =>
    resolveImage(store, input, {
      selector,
      role: 'reference',
      order: source.length + index,
    }),
  );
  const inputs = [...source, ...references];
  if (new Set(inputs.map((entry) => entry.file.id)).size !== inputs.length)
    throw new ApiError('invalid_request', 'Select each source or reference image only once.');
  if (inputs.reduce((total, entry) => total + entry.file.bytes, 0) > IMAGE_INPUT_BYTES_MAX)
    throw new ApiError('invalid_request', 'Selected input images exceed the request byte budget.');
  return inputs;
}

export interface ImageReservation {
  readonly key: string;
  readonly profileId: string;
  readonly origin: ImageOperationOrigin | null;
  readonly request: ImageOperationRequest;
  readonly endpoint: ImageEndpoint;
  readonly now: string;
}

function reserved(
  store: HostStore,
  input: ImageReservation,
): { readonly receipt: ImageOperationReceipt; readonly inputs: ResolvedImage[] } {
  return store.write(() => {
    const inputs = resolveInputs(store, input);
    admitOptions(input.endpoint, input.request, inputs.length);
    const receipt = IMAGE_OPERATION_RECEIPT.parse({
      id: input.request.operation_id,
      profile_id: input.profileId,
      chat_id: input.request.chat_id,
      request: input.request,
      endpoint: input.endpoint,
      origin: input.origin,
      inputs: inputs.map((entry) => entry.identity),
      state: 'reserved',
      progress: 0,
      results: [],
      message_id: null,
      created_at: input.now,
      updated_at: input.now,
      reason: null,
      usage: null,
    });
    return { receipt: store.imageOperations.reserve(input.key, receipt), inputs };
  });
}

export const IMAGE_RESERVE_UNIT = storeUnit(reserved);
