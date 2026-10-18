import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { HarnessExtensionTree } from '@smarteverything/domain';

const EXECUTABLE_BITS = 0o111;
const VERSION_CONTROL = '.git';

export function harnessTreeHash(tree: HarnessExtensionTree): string {
  const hash = createHash('sha256');
  for (const file of [...tree.files].sort((a, b) => (a.path < b.path ? -1 : 1)))
    hash.update(
      `${file.path}\0${file.executable === true ? 'x' : '-'}\0${createHash('sha256')
        .update(Buffer.from(file.base64, 'base64'))
        .digest('hex')}\n`,
    );
  return hash.digest('hex');
}

export async function readHarnessTree(directory: string): Promise<HarnessExtensionTree> {
  const files: HarnessExtensionTree['files'] = [];
  await collect(directory, directory, files);
  return { files };
}

async function collect(
  root: string,
  directory: string,
  files: HarnessExtensionTree['files'],
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === VERSION_CONTROL || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await collect(root, path, files);
    else if (entry.isFile())
      files.push({
        path: relative(root, path).split(sep).join('/'),
        base64: (await readFile(path)).toString('base64'),
        ...(((await lstat(path)).mode & EXECUTABLE_BITS) === 0 ? {} : { executable: true }),
      });
  }
}

export async function writeHarnessTree(
  directory: string,
  tree: HarnessExtensionTree,
): Promise<void> {
  for (const file of tree.files) {
    const path = join(directory, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(file.base64, 'base64'));
    if (file.executable === true) await chmod(path, 0o755);
  }
}
