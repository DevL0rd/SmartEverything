import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface StoredRoot {
  readonly root: string;
}

export class StoredPathError extends Error {
  override readonly name = 'StoredPathError';

  constructor(
    readonly value: string,
    reason: string,
  ) {
    super(`stored path ${JSON.stringify(value)} ${reason}`);
  }
}

const WINDOWS_DRIVE = /^[a-zA-Z]:/;

function isOutside(relativePath: string): boolean {
  return relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`);
}

export function toStored(layout: StoredRoot, absolute: string): string {
  if (!isAbsolute(absolute)) {
    throw new StoredPathError(absolute, 'is not absolute');
  }
  const relativePath = relative(resolve(layout.root), resolve(absolute));
  if (isOutside(relativePath) || isAbsolute(relativePath)) {
    throw new StoredPathError(absolute, `is outside the data folder ${layout.root}`);
  }
  return relativePath.split(sep).join('/');
}

export function fromStored(layout: StoredRoot, stored: string): string {
  if (stored.startsWith('/') || stored.startsWith('\\') || WINDOWS_DRIVE.test(stored)) {
    throw new StoredPathError(stored, 'is absolute');
  }
  if (stored.includes('\0') || stored.includes('\\')) {
    throw new StoredPathError(stored, 'holds a forbidden character');
  }
  const segments = stored.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new StoredPathError(stored, 'holds an empty, "." or ".." segment');
  }
  const root = resolve(layout.root);
  const path = join(root, ...segments);
  if (isOutside(relative(root, path))) {
    throw new StoredPathError(stored, `escapes the data folder ${layout.root}`);
  }
  return path;
}
