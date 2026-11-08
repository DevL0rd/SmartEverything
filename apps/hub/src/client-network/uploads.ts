import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  NATIVE_HUB_UPLOAD_CHUNK,
  NATIVE_HUB_UPLOAD_ID,
  NATIVE_HUB_UPLOAD_OPEN,
  type NativeHubResponse,
} from '@smarteverything/domain';
import type { HubLeasePort } from './lease';
import { HubTransportError } from './policy';
import { headerEntries, hubCall } from './transport';

export interface HubUploadOwner {
  readonly id: number;
}

type Outcome =
  | { readonly ok: true; readonly response: NativeHubResponse }
  | { readonly ok: false; readonly error: unknown };

interface HubUpload {
  readonly body: PassThrough;
  readonly controller: AbortController;
  readonly outcome: Promise<Outcome>;
  settled: boolean;
}

export class HubUploads<Owner extends HubUploadOwner> {
  readonly #uploads = new Map<string, HubUpload>();
  constructor(readonly policies: HubLeasePort) {}

  open(owner: Owner, value: unknown): void {
    const input = NATIVE_HUB_UPLOAD_OPEN.parse(value);
    const key = keyOf(owner, input.id);
    if (this.#uploads.has(key)) throw new HubTransportError('Hub upload ID exists');
    const lease = this.policies.lease(
      input.scopeId,
      input.url,
      input.binding,
      input.routeGeneration,
    );
    const controller = new AbortController();
    const signal =
      lease.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, lease.signal]);
    const body = new PassThrough();
    const call = hubCall(
      { ...lease, signal },
      {
        method: input.method,
        headers: { ...input.headers, 'content-length': String(input.length) },
        body,
      },
    );
    const upload: HubUpload = {
      body,
      controller,
      settled: false,
      outcome: outcomeOf(call, () => {
        if (!signal.aborted) this.policies.failed?.(input.scopeId, input.routeGeneration);
        body.destroy();
      }).then((outcome) => {
        upload.settled = true;
        return outcome;
      }),
    };
    this.#uploads.set(key, upload);
  }

  async send(owner: Owner, value: unknown): Promise<boolean> {
    const input = NATIVE_HUB_UPLOAD_CHUNK.parse(value);
    const upload = this.#required(owner, input.id);
    if (!accepting(upload)) return false;
    if (upload.body.write(input.data)) return true;
    await Promise.race([once(upload.body, 'drain'), upload.outcome]);
    return accepting(upload);
  }

  async finish(owner: Owner, value: unknown): Promise<NativeHubResponse> {
    const id = NATIVE_HUB_UPLOAD_ID.parse(value);
    const upload = this.#required(owner, id);
    upload.body.end();
    try {
      const outcome = await upload.outcome;
      if (!outcome.ok) throw outcome.error;
      return outcome.response;
    } finally {
      this.#uploads.delete(keyOf(owner, id));
    }
  }

  abort(owner: Owner, value: unknown): void {
    const id = NATIVE_HUB_UPLOAD_ID.parse(value);
    const key = keyOf(owner, id);
    const upload = this.#uploads.get(key);
    this.#uploads.delete(key);
    if (upload !== undefined) stop(upload);
  }

  closeOwner(owner: Owner): void {
    const prefix = `${String(owner.id)}:`;
    for (const [key, upload] of this.#uploads) {
      if (!key.startsWith(prefix)) continue;
      this.#uploads.delete(key);
      stop(upload);
    }
  }

  stop(): void {
    for (const upload of this.#uploads.values()) stop(upload);
    this.#uploads.clear();
  }

  #required(owner: Owner, id: string): HubUpload {
    const upload = this.#uploads.get(keyOf(owner, id));
    if (upload === undefined) throw new HubTransportError('Hub upload is not open');
    return upload;
  }
}

function outcomeOf(call: ReturnType<typeof hubCall>, failed: () => void): Promise<Outcome> {
  return call.then(
    async (response): Promise<Outcome> => ({
      ok: true,
      response: {
        status: response.statusCode,
        headers: Object.fromEntries(headerEntries(response.headers)),
        body: await response.body.text(),
      },
    }),
    (error: unknown): Outcome => {
      failed();
      return { ok: false, error };
    },
  );
}

function keyOf(owner: HubUploadOwner, id: string): string {
  return `${String(owner.id)}:${id}`;
}

function accepting(upload: HubUpload): boolean {
  return !upload.settled && !upload.body.destroyed;
}

function stop(upload: HubUpload): void {
  upload.controller.abort();
  upload.body.destroy();
}
