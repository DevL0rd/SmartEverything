import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PHOTOS_KEPT = 100;

const FOLDER = 'photos';
const FOLDER_MODE = 0o700;
const FILE_MODE = 0o600;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function imageTypeOf(body: Buffer): 'image/png' | 'image/jpeg' {
  return body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? 'image/png' : 'image/jpeg';
}

export class Photos {
  constructor(private readonly folder: string) {}

  async save(image: Buffer, mimeType: string): Promise<string> {
    const directory = join(this.folder, FOLDER);
    await mkdir(directory, { recursive: true, mode: FOLDER_MODE });
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const path = join(directory, `${String(Date.now())}-${randomUUID()}.${extension}`);
    await writeFile(path, image, { mode: FILE_MODE });
    await this.prune(directory);
    return path;
  }

  private async prune(directory: string): Promise<void> {
    const files = (await readdir(directory)).sort();
    await Promise.all(
      files
        .slice(0, Math.max(0, files.length - PHOTOS_KEPT))
        .map((file) => rm(join(directory, file), { force: true })),
    );
  }
}
