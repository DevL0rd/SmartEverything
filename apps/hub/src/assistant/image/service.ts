import {
  ApiError,
  IMAGE_OPERATION_REQUEST,
  IMAGE_OPERATION_RECEIPT,
  type ImageOperationRequest,
  type ImageOperationReceipt,
  type ImageEndpoint,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import pLimit from 'p-limit';
import type { ImageActor, ImageServiceOptions } from './contract';
import { ImageOperationError } from './errors';
import { ownedChat, readInputs, resolveInputs, type ResolvedImage } from './inputs';
import { keepResults } from './results';
import { imagePreview } from './preview';
import { recordImageUsage } from './usage';
import { admitOptions, withBestSettings } from '../../openrouter/image-options';

const log = new Logger('hub.assistant');
const PROVIDER_CONCURRENCY = 4;
const ABANDONED =
  'This call stopped waiting; the image request keeps running and the app shows its result. Do not start it again.';
interface RunningImage {
  readonly controller: AbortController;
  readonly settled: Promise<ImageOperationReceipt>;
}
export class ImageOperationService {
  private readonly running = new Map<string, RunningImage>();
  private readonly queue = pLimit(PROVIDER_CONCURRENCY);
  private accepting = true;
  constructor(private readonly options: ImageServiceOptions) {
    options.repository.recover((receipt) => recordImageUsage(options.store, receipt));
  }
  availability(): { readonly accepting: boolean; readonly active: number } {
    return { accepting: this.accepting, active: this.running.size };
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
  private publish(receipt: ImageOperationReceipt): void {
    this.options.publish(receipt);
  }
  async start(actor: ImageActor, value: unknown): Promise<ImageOperationReceipt> {
    const asked = IMAGE_OPERATION_REQUEST.parse(value);
    ownedChat(this.options, actor, asked.chat_id);
    const endpoint = await this.options.catalog.endpointFor(asked);
    const request = withBestSettings(endpoint, asked);
    const replay = this.options.repository.replay(actor.key, request);
    if (replay !== undefined) return replay;
    actor.signal?.throwIfAborted();
    actor.authorize('provider', request.chat_id);
    return this.begin(actor, request, endpoint);
  }
  private begin(
    actor: ImageActor,
    request: ImageOperationRequest,
    endpoint: ImageEndpoint,
  ): ImageOperationReceipt {
    if (!this.accepting) throw new ApiError('conflict', 'The image service is stopping.');
    const { receipt, inputs } = this.reserve(actor, request, endpoint);
    const controller = new AbortController();
    const signal =
      actor.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, actor.signal]);
    const settled = this.enqueue(receipt, inputs, signal).finally(() =>
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
  private enqueue(
    receipt: ImageOperationReceipt,
    inputs: readonly ResolvedImage[],
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    return new Promise((resolve, reject) => {
      let queued = true;
      signal.addEventListener(
        'abort',
        () => {
          if (!queued) return;
          queued = false;
          try {
            resolve(this.cancelQueued(receipt.id, signal));
          } catch (cause) {
            reject(
              new ImageOperationError(
                'unknown',
                `The queued cancellation was not recorded: ${messageOf(cause)}`,
              ),
            );
          }
        },
        { once: true },
      );
      this.queue(async () => {
        if (!queued) return;
        queued = false;
        resolve(await this.execute(receipt, inputs, signal));
      }).catch(reject);
    });
  }
  private cancelQueued(id: string, signal: AbortSignal): ImageOperationReceipt {
    const next = this.failure(this.options.repository.read(id), signal.reason, signal, false);
    this.publish(next);
    return next;
  }
  async settled(actor: ImageActor, id: string): Promise<ImageOperationReceipt> {
    const receipt = this.read(actor, id);
    const running = this.running.get(id);
    return running === undefined ? receipt : running.settled;
  }
  async run(
    actor: ImageActor,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    const started = await this.start(actor, value);
    return this.outcome(actor, started.id, signal);
  }
  async outcome(
    actor: ImageActor,
    id: string,
    signal?: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    await untilSettled(this.settled(actor, id), signal);
    return this.read(actor, id);
  }
  cancel(actor: ImageActor, id: string): ImageOperationReceipt {
    const receipt = this.read(actor, id);
    const running = this.running.get(id);
    if (running === undefined) return receipt;
    this.publish(this.options.repository.update({ ...receipt, cancellation_requested: true }));
    running.controller.abort();
    return this.options.repository.read(id);
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
    endpoint: ImageEndpoint,
  ): { readonly receipt: ImageOperationReceipt; readonly inputs: ResolvedImage[] } {
    return this.options.store.write(() => {
      const inputs = resolveInputs(this.options, actor, request);
      admitOptions(endpoint, request, inputs.length);
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
    initial: ImageOperationReceipt,
    inputs: readonly ResolvedImage[],
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    let receipt = initial;
    let submitted = false;
    try {
      signal.throwIfAborted();
      const images = await readInputs(this.options, inputs, signal);
      receipt = this.options.repository.update({ ...receipt, state: 'running' });
      this.publish(receipt);
      const result = await this.options.provider.generate({
        request: receipt.request,
        endpoint: receipt.endpoint,
        inputs: images,
        signal,
        submitted: () => {
          submitted = true;
        },
        usage: (usage, source) => {
          receipt = this.options.repository.update({ ...receipt, usage, usage_source: source });
          this.publish(receipt);
        },
        preview: async (content) => {
          receipt = await this.preview(receipt, content, signal);
        },
      });
      receipt = await keepResults(this.options, receipt, { result, signal });
    } catch (cause) {
      receipt = this.failure(receipt, cause, signal, submitted);
    }
    this.publish(receipt);
    return receipt;
  }
  private async preview(
    receipt: ImageOperationReceipt,
    content: Buffer,
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    signal.throwIfAborted();
    const next = this.options.repository.update({ ...receipt, progress: receipt.progress + 1 });
    this.publish(next);
    try {
      this.options.preview?.(await imagePreview(next, content));
    } catch (cause) {
      log.warn('image.preview_skipped', {
        operationId: next.id,
        reason: messageOf(cause),
      });
    }
    return next;
  }
  private failure(
    receipt: ImageOperationReceipt,
    cause: unknown,
    signal: AbortSignal,
    submitted: boolean,
  ): ImageOperationReceipt {
    const shutdown =
      signal.reason instanceof ImageOperationError && signal.reason.code === 'unknown';
    const cancelled = signal.aborted && !shutdown;
    const definitive = cause instanceof ImageOperationError && cause.code === 'provider';
    const state = failureState(cancelled, submitted, definitive);
    const reason = reasonOf(state, cause, submitted);
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

function untilSettled(
  settled: Promise<unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (signal === undefined) return settled;
  return new Promise((resolve, reject) => {
    const abandon = (): void => {
      reject(new ApiError('conflict', ABANDONED));
    };
    const release = (): void => {
      signal.removeEventListener('abort', abandon);
    };
    signal.addEventListener('abort', abandon, { once: true });
    if (signal.aborted) abandon();
    settled.finally(release).then(resolve, reject);
  });
}

const FAILURE_REASONS = {
  unknown: 'Provider delivery or billing is unknown. Do not automatically resubmit.',
  cancelled: 'Cancelled locally. Provider billing is unverified.',
  cancelledUnsent: 'Cancelled before it was sent to the provider. Nothing was billed.',
  failed: 'Image operation failed. No result was saved.',
} as const;
function reasonOf(
  state: 'cancelled' | 'unknown' | 'failed',
  cause: unknown,
  submitted: boolean,
): string {
  if (state === 'failed') return failedReason(cause);
  if (state === 'cancelled' && !submitted) return FAILURE_REASONS.cancelledUnsent;
  return FAILURE_REASONS[state];
}
function failedReason(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'invalid_request')
    return cause.message.slice(0, 200);
  if (cause instanceof ImageOperationError && cause.code !== 'unknown')
    return cause.detail.slice(0, 200);
  return FAILURE_REASONS.failed;
}
function failureState(
  cancelled: boolean,
  submitted: boolean,
  definitive: boolean,
): 'cancelled' | 'unknown' | 'failed' {
  if (cancelled) return 'cancelled';
  return submitted && !definitive ? 'unknown' : 'failed';
}
