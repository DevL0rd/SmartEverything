import { Upload } from 'tus-js-client';
import { Logger, background } from '@smarteverything/logging';
import { outcomeOfError, outcomeOfSuccess } from './errors';
import { blobFileReader } from './file-reader';
import { TransportHttpStack, UPLOAD_ENDPOINT } from './http-stack';
import { checkedRequest, fingerprintOf, uploadMetadata } from './metadata';
import { addUploadEntry, patchUploadEntry } from './store';
import type { TusFileReader, TusOptions, TusPreviousUpload, TusUrlStorage } from './tus-types';
import type { UploadHandle, UploadOutcome, UploadRequest, UploadTransport } from './types';

const log = new Logger('app.drive');

export interface UploadDeps {
  readonly transport: UploadTransport;
  readonly storage: TusUrlStorage;
  readonly chunkBytes: number;
  readonly input?: ConstructorParameters<typeof Upload>[0];
  readonly fileReader?: TusFileReader;
  readonly closeReader?: () => void | Promise<void>;
}

let sequence = 0;

function newest(previous: readonly TusPreviousUpload[]): TusPreviousUpload | undefined {
  return previous.reduce<TusPreviousUpload | undefined>(
    (best, candidate) =>
      best === undefined || candidate.creationTime > best.creationTime ? candidate : best,
    undefined,
  );
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function inputOf(
  request: UploadRequest,
  deps: UploadDeps,
): ConstructorParameters<typeof Upload>[0] {
  if (request.source instanceof Blob) return request.source;
  if (deps.input === undefined)
    throw new TypeError('A content upload needs its bounded media reader.');
  return deps.input;
}

class UploadRun {
  readonly id: string;
  readonly outcome: Promise<UploadOutcome>;
  private readonly upload: Upload;
  private readonly stack: TransportHttpStack;
  private readonly size: number;
  private finished = false;
  private paused = false;
  private begun = false;
  private readonly closeReader: () => void | Promise<void>;
  private settle: (outcome: UploadOutcome) => void = () => undefined;

  constructor(
    private readonly request: UploadRequest,
    deps: UploadDeps,
  ) {
    this.closeReader = deps.closeReader ?? ((): void => undefined);
    sequence += 1;
    this.id = `drive-upload-${String(sequence)}`;
    this.size = request.source.size;
    this.outcome = new Promise<UploadOutcome>((resolve) => {
      this.settle = resolve;
    });
    this.stack = new TransportHttpStack(deps.transport);
    this.upload = new Upload(inputOf(request, deps), this.optionsFor(deps));
    addUploadEntry({
      id: this.id,
      name: request.name,
      size: this.size,
      sent: 0,
      state: 'uploading',
      outcome: null,
    });
    background(this.begin(), 'upload.begin_failed');
  }

  handle(): UploadHandle {
    return {
      id: this.id,
      outcome: this.outcome,
      pause: (): Promise<void> => this.pause(),
      resume: (): void => {
        this.resume();
      },
      cancel: (): Promise<void> => this.cancel(),
    };
  }

  private optionsFor(deps: UploadDeps): TusOptions {
    const { request } = this;
    return {
      endpoint: UPLOAD_ENDPOINT,
      metadata: uploadMetadata(request),
      chunkSize: deps.chunkBytes,
      retryDelays: null,
      httpStack: this.stack,
      fileReader: deps.fileReader ?? blobFileReader,
      uploadSize: request.source.size,
      urlStorage: deps.storage,
      fingerprint: (): Promise<string> => Promise.resolve(fingerprintOf(request)),
      removeFingerprintOnSuccess: true,
      onProgress: (sent): void => {
        patchUploadEntry(this.id, { sent });
      },
      onSuccess: ({ lastResponse }): void => {
        this.finish(outcomeOfSuccess(lastResponse, request.name));
      },
      onError: (error): void => {
        this.finish(outcomeOfError(error));
      },
    };
  }

  private finish(result: UploadOutcome): void {
    if (this.finished) return;
    this.finished = true;
    background(this.complete(result), 'upload.reader_close_failed');
  }

  private async complete(result: UploadOutcome): Promise<void> {
    let outcome = result;
    try {
      await this.closeReader();
    } catch (cause) {
      outcome = outcomeOfError(asError(cause));
    }
    const complete = outcome.kind === 'done' || outcome.kind === 'already-have';
    patchUploadEntry(this.id, {
      state: 'settled',
      outcome,
      ...(complete ? { sent: this.size } : {}),
    });
    log.info('upload.settled', { id: this.id, outcome: outcome.kind });
    this.settle(outcome);
  }

  private async begin(): Promise<void> {
    try {
      const previous = newest(await this.upload.findPreviousUploads());
      if (this.finished) return;
      if (previous !== undefined) this.upload.resumeFromPreviousUpload(previous);
      log.info('upload.started', { id: this.id, resumed: previous !== undefined });
      this.begun = true;
      if (!this.paused) this.upload.start();
    } catch (cause) {
      this.finish(outcomeOfError(asError(cause)));
    }
  }

  private async pause(): Promise<void> {
    if (this.finished || this.paused) return;
    this.paused = true;
    const closing = this.closeReader();
    await this.upload.abort(false);
    await Promise.all([closing, this.stack.settled()]);
    patchUploadEntry(this.id, { state: 'paused' });
  }

  private resume(): void {
    if (this.finished || !this.paused) return;
    this.paused = false;
    patchUploadEntry(this.id, { state: 'uploading' });
    if (this.begun) this.upload.start();
  }

  private async cancel(): Promise<void> {
    if (this.finished) return;
    this.finish({ kind: 'cancelled' });
    try {
      await this.upload.abort(true);
    } catch (cause) {
      log.warn('upload.terminate_failed', { id: this.id, reason: asError(cause).message });
    }
  }
}

export function runUpload(input: UploadRequest, deps: UploadDeps): UploadHandle {
  return new UploadRun(checkedRequest(input), deps).handle();
}
