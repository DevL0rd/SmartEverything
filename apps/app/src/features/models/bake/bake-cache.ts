import { Directory, File, Paths } from 'expo-file-system';
import {
  STORED_BAKE,
  bakeKeyHash,
  bakeKeyText,
  imageUris,
  isSuperseded,
  parseJson,
  withUris,
  type BakeCache,
  type BakeKey,
  type BakedImage,
  type BakesInUse,
  type StoredBake,
} from './bake-protocol';

const FOLDER = 'model-bakes';

const PNG_DATA = 'data:image/png;base64,';

const MANIFEST = /^([0-9a-f]+)\.json$/u;

function folder(): Directory {
  const directory = new Directory(Paths.cache, FOLDER);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

async function readManifest(file: File): Promise<StoredBake | null> {
  const parsed = STORED_BAKE.safeParse(parseJson(await file.text()));
  return parsed.success ? parsed.data : null;
}

async function read(key: BakeKey): Promise<StoredBake | null> {
  const manifest = new File(folder(), `${bakeKeyHash(key)}.json`);
  if (!manifest.exists) return null;
  const stored = await readManifest(manifest);
  if (stored?.keyText !== bakeKeyText(key)) return null;
  return imageUris(stored.image).every((uri) => new File(uri).exists) ? stored : null;
}

function writePng(directory: Directory, name: string, uri: string): string {
  if (!uri.startsWith(PNG_DATA)) throw new Error('a baked image arrives as a PNG data URL');
  const file = new File(directory, name);
  file.write(uri.slice(PNG_DATA.length), { encoding: 'base64' });
  return file.uri;
}

function write(key: BakeKey, image: BakedImage): Promise<StoredBake> {
  const directory = folder();
  const hash = bakeKeyHash(key);
  const uris = imageUris(image).map((uri, at) =>
    writePng(directory, `${hash}.${String(at)}.png`, uri),
  );
  const stored: StoredBake = { keyText: bakeKeyText(key), key, image: withUris(image, uris) };
  new File(directory, `${hash}.json`).write(JSON.stringify(stored));
  return Promise.resolve(stored);
}

function hashOf(name: string): string {
  return name.split('.')[0] ?? name;
}

async function prune(inUse: BakesInUse): Promise<number> {
  const files = folder()
    .list()
    .filter((entry): entry is File => entry instanceof File);
  const kept = new Set<string>();
  let removed = 0;
  for (const file of files) {
    const hash = MANIFEST.exec(file.name)?.[1];
    if (hash === undefined) continue;
    const stored = await readManifest(file);
    if (stored !== null && !isSuperseded(stored.key, inUse)) {
      kept.add(hash);
      continue;
    }
    file.delete();
    removed += 1;
  }
  for (const file of files) {
    if (!MANIFEST.test(file.name) && !kept.has(hashOf(file.name))) file.delete();
  }
  return removed;
}

export const bakeCache: BakeCache = { read, write, prune };
