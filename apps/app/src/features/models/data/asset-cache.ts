import { Directory, File, Paths } from 'expo-file-system';
import type { AssetCache } from './asset-cache-protocol';

const FOLDER = 'model-assets';

const PART = '.part';

function folder(): Directory {
  const directory = new Directory(Paths.cache, FOLDER);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

async function read(sha256: string): Promise<Uint8Array | null> {
  const file = new File(folder(), sha256);
  return file.exists ? file.bytes() : null;
}

function write(sha256: string, bytes: Uint8Array): Promise<void> {
  const directory = folder();
  const part = new File(directory, `${sha256}${PART}`);
  if (part.exists) part.delete();
  part.write(bytes);
  const final = new File(directory, sha256);
  if (final.exists) final.delete();
  part.rename(sha256);
  return Promise.resolve();
}

function prune(keep: ReadonlySet<string>): Promise<number> {
  const stale = folder()
    .list()
    .filter((entry): entry is File => entry instanceof File && !keep.has(entry.name));
  for (const file of stale) file.delete();
  return Promise.resolve(stale.length);
}

export const assetCache: AssetCache = { read, write, prune };
