import { createHash, type Hash } from 'node:crypto';
import { HUB_UPDATE_BOOT_RECEIPT_FILE } from '@smarteverything/domain';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

class ServiceIdentityError extends Error {
  override readonly name = 'ServiceIdentityError';
}

function staysInside(root: string, path: string): boolean {
  const name = relative(root, path);
  return !isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`);
}

function checkedLink(root: string, path: string): string {
  const target = readlinkSync(path);
  if (
    isAbsolute(target) ||
    !staysInside(root, resolve(dirname(path), target)) ||
    !staysInside(root, realpathSync(path))
  ) {
    throw new ServiceIdentityError(`Service build link points outside its movable tree: ${path}`);
  }
  return target;
}

function digestEntry(hash: Hash, root: string, name: string, includeReceipt: boolean): void {
  const path = join(root, name);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    hash.update(JSON.stringify([name, 'link', checkedLink(root, path)]));
  } else if (stat.isDirectory()) {
    hash.update(JSON.stringify([name, 'directory', stat.mode]));
    for (const child of readdirSync(path).sort()) {
      if (!includeReceipt && name === '.' && child === HUB_UPDATE_BOOT_RECEIPT_FILE) continue;
      digestEntry(hash, root, join(name, child), includeReceipt);
    }
  } else if (stat.isFile()) {
    hash.update(JSON.stringify([name, 'file', stat.mode, stat.size]));
    hash.update(readFileSync(path));
  } else {
    throw new ServiceIdentityError(`Cannot identify unsupported service build entry ${path}`);
  }
}

export function serviceIdentity(root: string, includeReceipt = true): string {
  if (!lstatSync(root).isDirectory())
    throw new ServiceIdentityError(`The service build must be a directory: ${root}`);
  const hash = createHash('sha256');
  digestEntry(hash, realpathSync(root), '.', includeReceipt);
  return hash.digest('hex');
}
