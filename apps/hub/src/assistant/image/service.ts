import {
  ApiError,
  IMAGE_OPERATION_REQUEST,
  type ImageOperationRequest,
  type ImageOperationReceipt,
  type ImageEndpoint,
} from '@smarteverything/domain';
import { Logger, background, messageOf } from '@smarteverything/logging';
import pLimit from 'p-limit';
import type { ImageActor, ImageFailure, ImageServiceOptions } from './contract';
import { ImageOperationError } from './errors';
import { Generation } from './generation';
import { ownedChat, readInputs } from './inputs';
import type { ResolvedImage } from './reserve-unit';
import { keepResults } from './results';
import { imagePreview } from './preview';
import { withDefaults } from '../../openrouter/image-defaults';

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
  private readonly cancelling = new Map<string, Promise<ImageOperationReceipt>>();
  private readonly queue = pLimit(PROVIDER_CONCURRENCY);
  private accepting = true;
  private readonly recovered: Promise<void>;
  constructor(private readonly options: ImageServiceOptions) {
    this.recovered = options.store.host.write('imageRecover', null);
    background(this.recovered, 'image.recover_failed');
  }
  availability(): { readonly accepting: boolean; readonly active: number } {
    return { accepting: this.accepting, active: this.running.size };
  }
  async read(actor: ImageActor, id: string): Promise<ImageOperationReceipt> {
    const receipt = await this.options.store.host.call('imageOperations', 'read', id);
    await ownedChat(this.options, actor, receipt.chat_id);
    return receipt;
  }
  async list(actor: ImageActor, chatId: string): Promise<ImageOperationReceipt[]> {
    await ownedChat(this.options, actor, chatId);
    return await this.options.store.host.call('imageOperations', 'list', chatId);
  }
  private publish(receipt: ImageOperationReceipt): void {
    this.options.publish(receipt);
  }
  async start(actor: ImageActor, value: unknown): Promise<ImageOperationReceipt> {
    await this.recovered;
    const asked = IMAGE_OPERATION_REQUEST.parse(value);
    await ownedChat(this.options, actor, asked.chat_id);
    const endpoint = await this.options.catalog.endpointFor(asked);
    const request = withDefaults(endpoint, asked, this.options.imageDefaults());
    const replay = await this.options.store.host.call(
      'imageOperations',
      'replay',
      actor.key,
      request,
    );
    if (replay !== undefined) return replay;
    actor.signal?.throwIfAborted();
    await actor.authorize('provider', request.chat_id);
    return await this.begin(actor, request, endpoint);
  }
  private async begin(
    actor: ImageActor,
    request: ImageOperationRequest,
    endpoint: ImageEndpoint,
  ): Promise<ImageOperationReceipt> {
    if (!this.accepting) throw new ApiError('conflict', 'The image service is stopping.');
    const { receipt, inputs } = await this.options.store.host.write('imageReserve', {
      key: actor.key,
      profileId: actor.profileId,
      origin: actor.origin ?? null,
      request,
      endpoint,
      now: this.options.now().toISOString(),
    });
    const controller = new AbortController();
    const signal =
      actor.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, actor.signal]);
    const settled = this.enqueue(receipt, inputs, signal).finally(() =>
      this.running.delete(receipt.id),
    );
    void settled.catch((cause: unknown): void => {
      this.options.failed(receipt.id, failureOf(cause, 'receipt'));
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
          const cancelled = this.cancelQueued(receipt.id, signal);
          this.cancelling.set(receipt.id, cancelled);
          cancelled.then(
            (next) => {
              this.cancelling.delete(receipt.id);
              resolve(next);
            },
            (cause: unknown) => {
              this.cancelling.delete(receipt.id);
              reject(
                new ImageOperationError(
                  'unknown',
                  `The queued cancellation was not recorded: ${messageOf(cause)}`,
                ),
              );
            },
          );
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
  private async cancelQueued(id: string, signal: AbortSignal): Promise<ImageOperationReceipt> {
    const next = await this.failure(
      await this.options.store.host.call('imageOperations', 'read', id),
      signal.reason,
      signal,
      false,
    );
    this.publish(next);
    return next;
  }
  async settled(actor: ImageActor, id: string): Promise<ImageOperationReceipt> {
    const running = this.running.get(id);
    const receipt = await this.read(actor, id);
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
    return await this.read(actor, id);
  }
  async cancel(actor: ImageActor, id: string): Promise<ImageOperationReceipt> {
    const running = this.running.get(id);
    const receipt = await this.read(actor, id);
    if (running === undefined) return receipt;
    this.publish(
      await this.options.store.host.call('imageOperations', 'update', {
        ...receipt,
        cancellation_requested: true,
      }),
    );
    running.controller.abort();
    await this.cancelling.get(id);
    return this.options.store.host.call('imageOperations', 'read', id);
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
  private async execute(
    initial: ImageOperationReceipt,
    inputs: readonly ResolvedImage[],
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    const run = new Generation(this.options, {
      initial,
      inputs,
      publish: (next): void => {
        this.publish(next);
      },
      preview: (next, content): Promise<ImageOperationReceipt> =>
        this.preview(next, content, signal),
    });
    try {
      signal.throwIfAborted();
      const images = await readInputs(this.options, inputs, signal);
      run.receipt = await this.options.store.host.call('imageOperations', 'update', {
        ...run.receipt,
        state: 'running',
      });
      this.publish(run.receipt);
      signal.throwIfAborted();
      const result = await run.produce(images, signal);
      run.receipt = await keepResults(this.options, run.receipt, { result, signal });
    } catch (cause) {
      run.receipt = await this.failure(run.receipt, cause, signal, run.submitted);
    }
    this.publish(run.receipt);
    return run.receipt;
  }
  private async preview(
    receipt: ImageOperationReceipt,
    content: Buffer,
    signal: AbortSignal,
  ): Promise<ImageOperationReceipt> {
    signal.throwIfAborted();
    const next = await this.options.store.host.call('imageOperations', 'update', {
      ...receipt,
      progress: receipt.progress + 1,
    });
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
  ): Promise<ImageOperationReceipt> {
    const shutdown =
      signal.reason instanceof ImageOperationError && signal.reason.code === 'unknown';
    const cancelled = signal.aborted && !shutdown;
    const definitive =
      cause instanceof ImageOperationError && (cause.code === 'provider' || cause.code === 'quota');
    const state = failureState(cancelled, submitted, definitive);
    const reason = reasonOf(state, cause, submitted);
    this.options.failed(receipt.id, failureOf(cause, 'operation'));
    return this.options.store.host.write('imageSettle', {
      receipt: { ...receipt, state, reason, cancellation_requested: cancelled },
    });
  }
}
export type { ImageActor, ImageFailure, ImageServiceOptions } from './contract';

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
function failureOf(cause: unknown, stage: 'receipt' | 'operation'): ImageFailure {
  return {
    code: cause instanceof ImageOperationError ? cause.code : stage,
    reason: messageOf(cause),
  };
}
function failureState(
  cancelled: boolean,
  submitted: boolean,
  definitive: boolean,
): 'cancelled' | 'unknown' | 'failed' {
  if (cancelled) return 'cancelled';
  return submitted && !definitive ? 'unknown' : 'failed';
}
