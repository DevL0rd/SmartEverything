import { background } from '@smarteverything/logging';
import { assertUploadActive } from './abort';
import type { TusFileReader } from './tus-types';
import type { ContentUploadSource } from './types';

type FileSource = Awaited<ReturnType<TusFileReader['openFile']>>;

type ReadChunk = (offset: number, bytes: number, signal: AbortSignal) => Promise<Blob>;

class ContentReader {
  private position = 0;
  readonly input: Pick<ReadableStreamDefaultReader<Blob>, 'read'> = {
    read: async (): Promise<ReadableStreamReadResult<Blob>> => {
      if (this.position >= this.source.size) return { done: true, value: undefined };
      const end = Math.min(this.position + this.chunkBytes, this.source.size);
      const chunk = await this.slice(this.position, end);
      this.position = end;
      return { done: false, value: chunk.value };
    },
  };
  private controller = new AbortController();
  private readonly inflight = new Set<Promise<Blob>>();
  readonly fileReader: TusFileReader;

  constructor(
    private readonly source: ContentUploadSource,
    private readonly read: ReadChunk,
    private readonly chunkBytes: number,
  ) {
    this.fileReader = {
      openFile: (input: unknown): Promise<FileSource> => {
        if (input !== this.input)
          return Promise.reject(new TypeError('The upload source does not match its reader.'));
        return Promise.resolve({
          size: source.size,
          slice: this.slice,
          close: (): void => {
            background(this.close(), 'upload.reader_close_failed');
          },
        });
      },
    };
  }

  readonly close = async (): Promise<void> => {
    this.controller.abort();
    await Promise.allSettled([...this.inflight]);
  };

  private readonly slice = async (
    start: number,
    end: number,
  ): Promise<{ value: Blob; done: boolean }> => {
    const length = Math.min(end, this.source.size) - start;
    if (start < 0 || length < 0 || length > this.chunkBytes)
      throw new RangeError('Invalid media upload range.');
    if (this.controller.signal.aborted) this.controller = new AbortController();
    const signal = this.controller.signal;
    const pending = this.read(start, length, signal);
    this.inflight.add(pending);
    try {
      const value = await pending;
      assertUploadActive(signal);
      if (value.size !== length) throw new Error('Media changed during upload.');
      return { value, done: start + length >= this.source.size };
    } finally {
      this.inflight.delete(pending);
    }
  };
}

export function createContentReader(
  source: ContentUploadSource,
  read: ReadChunk,
  chunkBytes: number,
): {
  readonly input: Pick<ReadableStreamDefaultReader<Blob>, 'read'>;
  readonly fileReader: TusFileReader;
  readonly close: () => Promise<void>;
} {
  return new ContentReader(source, read, chunkBytes);
}
