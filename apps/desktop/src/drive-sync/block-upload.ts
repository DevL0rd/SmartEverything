export interface BlockUploader {
  readonly put: (txn: string, index: number, bytes: Uint8Array) => Promise<void>;
}

export interface HubBlockUploaderOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly fetch: typeof fetch;
}

export class BlockUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlockUploadError';
  }
}

export class HubBlockUploader implements BlockUploader {
  readonly #options: HubBlockUploaderOptions;

  constructor(options: HubBlockUploaderOptions) {
    this.#options = options;
  }

  async put(txn: string, index: number, bytes: Uint8Array): Promise<void> {
    const url = new URL(
      `/drive/sync/${encodeURIComponent(txn)}/block/${String(index)}`,
      this.#options.hubUrl,
    );
    const response = await this.#options.fetch(url, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${this.#options.token}`,
        'content-type': 'application/octet-stream',
      },
      body: bytes,
    });
    await response.body?.cancel();
    if (!response.ok) {
      throw new BlockUploadError(
        response.status,
        `The hub refused block ${String(index)} with status ${String(response.status)}`,
      );
    }
  }
}
