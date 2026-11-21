import { NAME_MAX_BYTES, isWellFormed, utf8Bytes } from '@smarteverything/domain/drive-mount';
import { posix } from './errors';
import { isReservedPath } from './reserved';

export function checkName(name: string): void {
  if (!isWellFormed(name)) throw posix('EILSEQ', 'A name must be valid UTF-8.');
  if (name === '') throw posix('ENOENT', 'A name cannot be empty.');
  if (name !== name.normalize('NFC')) {
    throw posix('EILSEQ', 'A drive name must be in Unicode normal form C.');
  }
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
    throw posix('EINVAL', 'A name has no slash, no NUL and is not a dot entry.');
  }
  if (utf8Bytes(name) > NAME_MAX_BYTES) {
    throw posix('ENAMETOOLONG', `A name is at most ${String(NAME_MAX_BYTES)} bytes.`);
  }
}

export function checkNewPath(relPath: string): void {
  if (isReservedPath(relPath)) {
    throw posix('EPERM', 'That name is reserved by the drive.');
  }
}
