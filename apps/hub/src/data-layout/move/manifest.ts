import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { fsCode } from '../../fs-code';
import { atomicWrite } from '../pointer';
import { MOVE_AREAS } from './areas';

export const MOVE_DIRECTORY = '.move';
const MANIFEST_FILE = 'manifest.jsonl';
const MARKER_FILE = 'move.json';

const COUNT = z.int().nonnegative();

export const MANIFEST_ENTRY = z.strictObject({
  path: z.string().min(1),
  area: z.enum(MOVE_AREAS),
  kind: z.enum(['file', 'directory', 'symlink', 'special']),
  size: COUNT,
  mtimeMs: z.number().nonnegative(),
  mode: COUNT,
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  prefixHits: COUNT,
  stable: z.boolean(),
});

export type ManifestEntry = Readonly<z.infer<typeof MANIFEST_ENTRY>>;

export const MOVE_MARKER = z.strictObject({
  moveId: z.uuid(),
  rootId: z.uuid(),
});

export type MoveMarker = Readonly<z.infer<typeof MOVE_MARKER>>;

export function manifestPath(targetRoot: string): string {
  return join(targetRoot, MOVE_DIRECTORY, MANIFEST_FILE);
}

export async function writeMoveMarker(targetRoot: string, marker: MoveMarker): Promise<void> {
  const checked = MOVE_MARKER.parse(marker);
  await mkdir(join(targetRoot, MOVE_DIRECTORY), { recursive: true });
  await atomicWrite(
    join(targetRoot, MOVE_DIRECTORY, MARKER_FILE),
    `${JSON.stringify(checked, null, 2)}\n`,
  );
}

export async function readMoveMarker(targetRoot: string): Promise<MoveMarker | undefined> {
  let text: string;
  try {
    text = await readFile(join(targetRoot, MOVE_DIRECTORY, MARKER_FILE), 'utf8');
  } catch (error) {
    if (fsCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`the move marker in ${targetRoot} is not valid JSON`, { cause: error });
  }
  const parsed = MOVE_MARKER.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}

export class ManifestWriter {
  private constructor(private readonly handle: FileHandle) {}

  static async create(targetRoot: string): Promise<ManifestWriter> {
    await mkdir(join(targetRoot, MOVE_DIRECTORY), { recursive: true });
    return new ManifestWriter(await open(manifestPath(targetRoot), 'w'));
  }

  async append(entry: ManifestEntry): Promise<void> {
    await this.handle.appendFile(`${JSON.stringify(MANIFEST_ENTRY.parse(entry))}\n`);
  }

  async close(): Promise<void> {
    try {
      await this.handle.sync();
    } finally {
      await this.handle.close();
    }
  }
}

export async function* readManifest(targetRoot: string): AsyncGenerator<ManifestEntry> {
  const lines = createInterface({
    input: createReadStream(manifestPath(targetRoot), { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of lines) {
      yield MANIFEST_ENTRY.parse(JSON.parse(line));
    }
  } finally {
    lines.close();
  }
}
