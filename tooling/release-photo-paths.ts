import { closeSync, existsSync, fsyncSync, openSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export function withinRoot(root: string, path: string): string {
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (isAbsolute(path) || rel === '' || rel === '..' || rel.startsWith('../'))
    throw new Error('Photo migration path leaves its managed root');
  let parent = resolved;
  while (!existsSync(parent)) parent = dirname(parent);
  const canonical = relative(realpathSync(root), realpathSync(parent));
  if (canonical === '..' || canonical.startsWith('../'))
    throw new Error('Photo migration path follows a link outside its managed root');
  return resolved;
}

export function syncDirectory(directory: string): void {
  const descriptor = openSync(directory, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function syncPhotoDirectories(root: string, relativeDirectory: string): void {
  let directory = relativeDirectory;
  for (;;) {
    syncDirectory(directory === '.' || directory === '' ? root : withinRoot(root, directory));
    if (directory === '.' || directory === '') return;
    directory = dirname(directory);
  }
}
