import { open as openZipFile, type Entry, type ZipFile } from 'yauzl';
import type { Readable } from 'node:stream';

export type { Entry, ZipFile };

export class ZipReadError extends Error {
  override readonly name = 'ZipReadError';

  constructor(cause: unknown) {
    super('This archive could not be read.', { cause });
  }
}

export function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    openZipFile(
      path,
      { lazyEntries: true, autoClose: false, strictFileNames: false, validateEntrySizes: false },
      (cause, zip) => {
        if (cause !== null) reject(new ZipReadError(cause));
        else resolve(zip);
      },
    );
  });
}

export function closeZip(zip: ZipFile): void {
  zip.close();
}

export async function visitEntries(
  zip: ZipFile,
  visit: (entry: Entry, index: number) => Promise<'next' | 'stop'> | 'next' | 'stop',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let index = 0;
    zip.on('error', (cause: unknown) => {
      reject(new ZipReadError(cause));
    });
    zip.on('end', resolve);
    zip.on('entry', (entry: Entry) => {
      const current = index;
      index += 1;
      Promise.resolve(visit(entry, current)).then((outcome) => {
        if (outcome === 'stop') resolve();
        else zip.readEntry();
      }, reject);
    });
    zip.readEntry();
  });
}

export function openEntryStream(
  zip: ZipFile,
  entry: Entry,
  range?: { readonly start: number; readonly end: number },
): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const callback = (cause: Error | null, stream: Readable): void => {
      if (cause !== null) reject(cause);
      else resolve(stream);
    };
    if (range === undefined) zip.openReadStream(entry, callback);
    else zip.openReadStream(entry, { start: range.start, end: range.end }, callback);
  });
}

export async function readEntryBytes(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await openEntryStream(zip, entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

export function isFolderEntry(entry: Entry): boolean {
  return entry.fileName.endsWith('/');
}
