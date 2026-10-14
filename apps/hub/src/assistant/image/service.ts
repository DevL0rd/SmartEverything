import {
  ApiError,
  IMAGE_OPERATION_REQUEST,
  IMAGE_OPERATION_RECEIPT,
  IMAGE_SELECTOR,
  IMAGE_WAIT_REQUEST,
  type ImageWaitResult,
  type ImageOperationRequest,
  type ImageOperationReceipt,
  type ImageResolvedSelection,
} from '@smarteverything/domain';
import type { ImageActor, ImageServiceOptions } from './contract';
import { ImageOperationError } from './errors';
import { ownedChat, readInputs, resolveImage, resolveInputs, type ResolvedImage } from './inputs';
import { keepResults } from './results';
import { summaryOf } from '../../store/repositories/assistant-chat';
import { imagePreview } from './preview';
import type { ImageBytes } from './media';
import { recordImageUsage } from './usage';
import { rasterIssue, requireRasterRuntime } from './raster-process';
import { waitForImageBatch } from './wait';

const PROVIDER_TIMEOUT_MS = 180_000;
const ACTIVE_IMAGE_OPERATIONS_MAX = 4;
interface RunningImage {
  readonly controller: AbortController;
  readonly settled: Promise<ImageOperationReceipt>;
}
export class ImageOperationService {
  private readonly running = new Map<string, RunningImage>();
  private accepting = true;
  private readonly listeners = new Set<(receipt: ImageOperationReceipt) => void>();
  constructor(private readonly options: ImageServiceOptions) {
    options.repository.recover((receipt) => recordImageUsage(options.store, receipt));
  }
  availability(): {
    readonly accepting: boolean;
    readonly active: number;
    readonly capacity: number;
    readonly rasterIssue: string | null;
  } {
    return {
      accepting: this.accepting,
      active: this.running.size,
      capacity: ACTIVE_IMAGE_OPERATIONS_MAX,
      rasterIssue: rasterIssue(),
    };
  }
  endpoints(actor: ImageActor): ReturnType<ImageServiceOptions['catalog']['list']> {
    actor.authorize('read', '');
    return this.options.catalog.list();
  }
  resolve(actor: ImageActor, chatId: string, selector: unknown): ImageResolvedSelection {
    const resolved = resolveImage(this.options, actor, chatId, {
      selector: IMAGE_SELECTOR.parse(selector),
      role: 'reference',
      order: 0,
    });
    return { ...resolved.identity, attachment: summaryOf(resolved.file) };
  }
  read(actor: ImageActor, id: string): ImageOperationReceipt {
    const receipt = this.options.repository.read(id);
    ownedChat(this.options, actor, receipt.chat_id);
    return receipt;
  }
  list(actor: ImageActor, chatId: string): ImageOperationReceipt[] {
    ownedChat(this.options, actor, chatId);
    return this.options.repository.list(chatId);
  }
  wait(
    actor: ImageActor,
    chatId: string,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<ImageWaitResult> {
    const input = IMAGE_WAIT_REQUEST.parse(value);
    const signals = [actor.signal, signal].filter((candidate) => candidate !== undefined);
    actor.authorize('wait', chatId);
    ownedChat(this.options, actor, chatId);
    return waitForImageBatch({
      snapshot: () =>
        input.operation_ids ??
        [...this.running.keys()].filter(
          (id) => this.options.repository.read(id).chat_id === chatId,
        ),
      read: (id) => this.waitReceipt(actor, chatId, id),
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
      waitMs: input.wait_ms,
      ...(signals.length === 0 ? {} : { signal: AbortSignal.any(signals) }),
    });
  }
  private waitReceipt(actor: ImageActor, chatId: string, id: string): ImageOperationReceipt {
    actor.authorize('wait', chatId);
    const receipt = this.read(actor, id);
    if (receipt.chat_id !== chatId)
      throw new ApiError('forbidden', 'An image wait cannot leave its initiating chat.');
    if (receipt.state === 'completed' && receipt.message_deleted !== true)
      for (const artifact of receipt.results)
        this.resolve(actor, chatId, { kind: 'attachment', attachment_id: artifact.attachment.id });
    return receipt;
  }
  private publish(receipt: ImageOperationReceipt): void {
    this.options.publish(receipt);
    for (const listener of this.listeners) listener(receipt);
  }
  start(actor: ImageActor, value: unknown): ImageOperationReceipt {
    const request = IMAGE_OPERATION_REQUEST.parse(value);
    ownedChat(this.options, actor, request.chat_id);
    const replay = this.options.repository.replay(actor.key, request);
    if (replay !== undefined) return replay;
    if (!this.accepting) throw new ApiError('conflict', 'The image service is stopping.');
    if (this.running.size >= ACTIVE_IMAGE_OPERATIONS_MAX)
      throw new ApiError(
        'conflict',
        'Four image operations are already active. Wait for one to finish.',
      );
    actor.signal?.throwIfAborted();
    actor.authorize('provider', request.chat_id);
    const { receipt, inputs } = this.reserve(actor, request);
    const controller = new AbortController();
    const signal =
      actor.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, actor.signal]);
    const settled = this.execute(actor, receipt, inputs, signal).finally(() =>
      this.running.delete(receipt.id),
    );
    void settled.catch((cause: unknown): void => {
      this.options.failed(
        receipt.id,
        cause instanceof ImageOperationError ? cause.code : 'receipt',
      );
    });
    this.running.set(receipt.id, { controller, settled });
    this.publish(receipt);
    return receipt;
  }
  async settled(actor: ImageActor, id: string): Promise<ImageOperationReceipt> {
    const receipt = this.read(actor, id);
    const running = this.running.get(id);
    return running === undefined ? receipt : running.settled;
  }
  cancel(actor: ImageActor, id: string): ImageOperationReceipt {
    const receipt = this.read(actor, id);
    const running = this.running.get(id);
    if (running === undefined) return receipt;
    const next = this.options.repository.update({ ...receipt, cancellation_requested: true });
    running.controller.abort();
    this.publish(next);
    return next;
  }
  async stop(): Promise<void> {
    this.accepting = false;
    const active = [...this.running.values()];
    for (const task of active)
      task.controller.abort(
        new ImageOperationError('unknown', 'The image service is shutting down.'),
      );
    const settled = await Promise.allSettled(active.map((task) => task.settled));
    if (settled.some((result) => result.status === 'rejected'))
      throw new ImageOperationError('unknown', 'Image receipts did not settle during shutdown.');
  }
  private reserve(
    actor: ImageActor,
    request: ImageOperationRequest,
  ): { readonly receipt: ImageOperationReceipt; readonly inputs: ResolvedImage[] } {
    return this.options.store.write(() => {
      const inputs = resolveInputs(this.options, actor, request);
      const endpoint = this.options.catalog.selected(request, inputs.length);
      const now = this.options.now().toISOString();
      const receipt = IMAGE_OPERATION_RECEIPT.parse({
        id: request.operation_id,
        profile_id: actor.profileId,
        chat_id: request.chat_id,
        request,
        endpoint,
        origin: actor.origin ?? null,
        inputs: inputs.map((input) => input.identity),
        state: 'reserved',
        progress: 0,
        results: [],
        message_id: null,
        created_at: now,
        updated_at: now,
        reason: null,
        usage: null,
      });
      return { receipt: this.options.repository.reserve(actor.key, receipt), inputs };
    });
  }
  private async execute(
    actor: ImageActor,
    initial: ImageOperationReceipt,
    inputs: readonly ResolvedImage[],
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    let receipt = initial;
    let submitted = false;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)]);
    try {
      const images = await this.prepareInputs(actor, receipt, inputs, bounded);
      receipt = this.options.repository.update({ ...receipt, state: 'running' });
      this.publish(receipt);
      actor.authorize('provider', receipt.chat_id);
      await this.options.catalog.verify(receipt.endpoint, bounded);
      const result = await this.options.provider.generate({
        request: receipt.request,
        endpoint: receipt.endpoint,
        inputs: images,
        signal: bounded,
        submitted: () => {
          submitted = true;
        },
        usage: (usage, source) => {
          receipt = this.options.repository.update({ ...receipt, usage, usage_source: source });
          this.publish(receipt);
        },
        authorize: () => {
          ownedChat(this.options, actor, receipt.chat_id);
          actor.authorize('provider', receipt.chat_id);
        },
        preview: async (image) => {
          receipt = await this.preview(actor, receipt, { image, signal: bounded });
        },
      });
      if (result.images.length > receipt.request.options.n)
        throw new ImageOperationError('limit', 'Provider returned more images than requested.');
      receipt = await keepResults(this.options, actor, receipt, { result, signal: bounded });
    } catch (cause) {
      const shutdown =
        signal.reason instanceof ImageOperationError && signal.reason.code === 'unknown';
      receipt = this.failure(receipt, cause, signal.aborted && !shutdown, submitted);
    }
    this.publish(receipt);
    return receipt;
  }
  private async prepareInputs(
    actor: ImageActor,
    receipt: ImageOperationReceipt,
    inputs: readonly ResolvedImage[],
    signal: AbortSignal,
  ): ReturnType<typeof readInputs> {
    await requireRasterRuntime(signal);
    const images = await readInputs(this.options, actor, receipt.chat_id, { inputs, signal });
    signal.throwIfAborted();
    return images;
  }
  private async preview(
    actor: ImageActor,
    receipt: ImageOperationReceipt,
    input: { readonly image: ImageBytes; readonly signal: AbortSignal },
  ): Promise<ImageOperationReceipt> {
    input.signal.throwIfAborted();
    const next = this.options.repository.update({ ...receipt, progress: receipt.progress + 1 });
    this.publish(next);
    const preview = await imagePreview(next, input.image, input.signal);
    input.signal.throwIfAborted();
    ownedChat(this.options, actor, next.chat_id);
    this.options.preview?.(preview);
    return next;
  }
  private failure(
    receipt: ImageOperationReceipt,
    cause: unknown,
    cancelled: boolean,
    submitted: boolean,
  ): ImageOperationReceipt {
    const definitive = cause instanceof ImageOperationError && cause.code === 'provider';
    const state = failureState(cancelled, submitted, definitive);
    const reason =
      state === 'failed' && cause instanceof ApiError && cause.code === 'invalid_request'
        ? cause.message.slice(0, 200)
        : FAILURE_REASONS[state];
    this.options.failed(
      receipt.id,
      cause instanceof ImageOperationError ? cause.code : 'operation',
    );
    return this.options.store.write(() =>
      this.options.repository.update(
        recordImageUsage(this.options.store, {
          ...receipt,
          state,
          reason,
          cancellation_requested: cancelled,
        }),
      ),
    );
  }
}
export type { ImageActor, ImageServiceOptions } from './contract';

const FAILURE_REASONS = {
  unknown: 'Provider delivery or billing is unknown. Do not automatically resubmit.',
  cancelled: 'Cancelled locally. Provider billing is unverified.',
  failed: 'Image operation failed. No result was saved.',
} as const;
function failureState(
  cancelled: boolean,
  submitted: boolean,
  definitive: boolean,
): 'cancelled' | 'unknown' | 'failed' {
  if (cancelled) return 'cancelled';
  return submitted && !definitive ? 'unknown' : 'failed';
}
