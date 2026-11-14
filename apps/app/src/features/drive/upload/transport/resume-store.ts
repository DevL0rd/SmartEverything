import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import type { TusPreviousUpload, TusUrlStorage } from './tus-types';

const log = new Logger('app.drive');

export const RESUME_STORAGE_KEY = 'smarteverything.drive.uploads';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const STORED = z.record(
  z.string(),
  z.strictObject({
    fingerprint: z.string().min(1),
    upload: z.strictObject({
      size: z.number().nullable(),
      metadata: z.record(z.string(), z.string()),
      creationTime: z.string(),
      urlStorageKey: z.string(),
      uploadUrl: z.string().nullable(),
      parallelUploadUrls: z
        .array(z.string())
        .nullish()
        .transform((urls) => urls ?? null),
    }),
  }),
);

type Stored = z.infer<typeof STORED>;

export class PersistedUrlStorage implements TusUrlStorage {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly storageKey: string = RESUME_STORAGE_KEY,
  ) {}

  async findAllUploads(): Promise<TusPreviousUpload[]> {
    const stored = await this.read();
    return Object.values(stored).map((entry) => entry.upload);
  }

  async findUploadsByFingerprint(fingerprint: string): Promise<TusPreviousUpload[]> {
    const stored = await this.read();
    return Object.values(stored)
      .filter((entry) => entry.fingerprint === fingerprint)
      .map((entry) => entry.upload);
  }

  addUpload(fingerprint: string, upload: TusPreviousUpload): Promise<string> {
    const urlStorageKey = `${fingerprint}#${upload.uploadUrl ?? upload.creationTime}`;
    return this.change((stored) => ({
      ...stored,
      [urlStorageKey]: { fingerprint, upload: { ...upload, urlStorageKey } },
    })).then(() => urlStorageKey);
  }

  async removeUpload(urlStorageKey: string): Promise<void> {
    await this.change((stored) =>
      Object.fromEntries(Object.entries(stored).filter(([key]) => key !== urlStorageKey)),
    );
  }

  private change(edit: (stored: Stored) => Stored): Promise<void> {
    const run = async (): Promise<void> => {
      const next = edit(await this.load());
      await this.storage.setItem(this.storageKey, JSON.stringify(next));
    };
    const next = this.queue.then(run);
    this.queue = next.catch((cause: unknown) => {
      log.warn('upload.resume_store_write_failed', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    });
    return next;
  }

  private async read(): Promise<Stored> {
    await this.queue;
    return this.load();
  }

  private async load(): Promise<Stored> {
    const text = await this.storage.getItem(this.storageKey);
    if (text === null) return {};
    try {
      return STORED.parse(JSON.parse(text));
    } catch (cause) {
      log.warn('upload.resume_store_unreadable', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return {};
    }
  }
}
