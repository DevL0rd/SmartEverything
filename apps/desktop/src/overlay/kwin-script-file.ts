import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FILE_MODE = 0o644;
const DIRECTORY_MODE = 0o755;

function digest(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function current(target: string): Promise<Buffer | null> {
  try {
    return await readFile(target);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw cause;
  }
}

export async function installKwinScript(source: string, directory: string): Promise<string> {
  const content = await readFile(source);
  const target = path.join(directory, 'overlay.js');
  const existing = await current(target);
  if (existing !== null && digest(existing) === digest(content)) {
    return target;
  }
  await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  const staged = `${target}.${String(process.pid)}.tmp`;
  await writeFile(staged, content, { mode: FILE_MODE });
  await rename(staged, target);
  return target;
}
