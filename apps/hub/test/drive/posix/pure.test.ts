import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { attrOf, DIRECTORY_BYTES, sizeOf } from '../../../src/drive/posix/attr';
import { guarded, PosixError, posixErrorOf } from '../../../src/drive/posix/errors';
import { checkName, checkNewPath } from '../../../src/drive/posix/names';
import { isReservedPath } from '../../../src/drive/posix/reserved';
import { after, nowNs, relatimeDue, RELATIME_WINDOW_NS } from '../../../src/drive/posix/times';
import { DriveWriteError } from '../../../src/drive/write-error';
import { DrivePathError } from '../../../src/drive/paths';
import {
  DriveFileTooLargeError,
  DriveFreeSpaceError,
  DriveQuotaExceededError,
} from '../../../src/drive/quotas';
import type { DriveInode } from '../../../src/store/repositories/drive-inodes';

function inode(overrides: Partial<DriveInode>): DriveInode {
  return {
    id: 7,
    rootId: 'r',
    isRoot: false,
    type: 'file',
    mode: 0o644,
    uid: null,
    gid: null,
    rdev: null,
    linkTarget: null,
    atimeNs: 1n,
    mtimeNs: 2n,
    ctimeNs: 3n,
    btimeNs: 4n,
    orphan: false,
    ...overrides,
  };
}

function codeOf(operation: () => void): string {
  try {
    operation();
  } catch (cause) {
    if (cause instanceof PosixError) return cause.code;
    throw cause;
  }
  return 'none';
}

describe('names', () => {
  it('accepts an ordinary name and a name of exactly 255 bytes', () => {
    expect(
      codeOf(() => {
        checkName('report.txt');
      }),
    ).toBe('none');
    expect(
      codeOf(() => {
        checkName('a'.repeat(255));
      }),
    ).toBe('none');
  });

  it('counts bytes, not characters', () => {
    expect(
      codeOf(() => {
        checkName('é'.repeat(128));
      }),
    ).toBe('ENAMETOOLONG');
    expect(
      codeOf(() => {
        checkName('é'.repeat(127));
      }),
    ).toBe('none');
  });

  it('refuses invalid UTF-8 with EILSEQ', () => {
    expect(
      codeOf(() => {
        checkName('a\ud800b');
      }),
    ).toBe('EILSEQ');
  });

  it('refuses empty names, dot entries, slashes and NUL', () => {
    expect(
      codeOf(() => {
        checkName('');
      }),
    ).toBe('ENOENT');
    for (const name of ['.', '..', 'a/b', 'a\0b']) {
      expect(
        codeOf(() => {
          checkName(name);
        }),
      ).toBe('EINVAL');
    }
  });

  it('reserves the drive folders at the top of the drive only', () => {
    expect(isReservedPath('.smarteverything/trash')).toBe(true);
    expect(isReservedPath('.se-orphans')).toBe(true);
    expect(isReservedPath('.locked/x')).toBe(true);
    expect(isReservedPath('docs/.locked')).toBe(false);
    expect(
      codeOf(() => {
        checkNewPath('.se-orphans');
      }),
    ).toBe('EPERM');
    expect(
      codeOf(() => {
        checkNewPath('docs/.se-orphans');
      }),
    ).toBe('none');
  });
});

describe('times', () => {
  it('keeps a time strictly after the prior one', () => {
    expect(after(10n, 20n)).toBe(20n);
    expect(after(20n, 20n)).toBe(21n);
    expect(after(30n, 20n)).toBe(31n);
  });

  it('reads the clock in nanoseconds', () => {
    expect(nowNs({ now: () => new Date('2026-11-07T00:00:00.001Z') })).toBe(
      BigInt(Date.parse('2026-11-07T00:00:00.001Z')) * 1_000_000n,
    );
  });

  it('follows relatime: update when access is not newer than modify or change, or a day old', () => {
    const fresh = { atimeNs: 100n, mtimeNs: 50n, ctimeNs: 60n };
    expect(relatimeDue(fresh, 200n)).toBe(false);
    expect(relatimeDue({ ...fresh, atimeNs: 50n }, 200n)).toBe(true);
    expect(relatimeDue({ ...fresh, atimeNs: 60n }, 200n)).toBe(true);
    expect(relatimeDue(fresh, 100n + RELATIME_WINDOW_NS - 1n)).toBe(false);
    expect(relatimeDue(fresh, 100n + RELATIME_WINDOW_NS)).toBe(true);
  });
});

describe('attributes', () => {
  it('sizes a folder, a link in bytes, a file by its item and a special file as zero', () => {
    expect(sizeOf(inode({ type: 'dir' }), null)).toBe(DIRECTORY_BYTES);
    expect(sizeOf(inode({ type: 'symlink', linkTarget: 'é/b' }), null)).toBe(4);
    expect(sizeOf(inode({ type: 'file' }), null)).toBe(0);
    expect(sizeOf(inode({ type: 'fifo' }), null)).toBe(0);
  });

  it('counts blocks in 512 byte units and keeps the person as a null owner', () => {
    const attr = attrOf({ inode: inode({}), item: null, nlink: 1, size: 513 });
    expect(attr).toMatchObject({
      ino: 7,
      type: 1,
      blocks: 2,
      uid: null,
      gid: null,
      rdev: 0,
      rev: 0,
    });
    expect(attr.etag).toBe('inode-7');
  });
});

describe('errno mapping', () => {
  it('maps the drive failures to their errors', () => {
    expect(posixErrorOf(new DriveWriteError('exists', 'x'))?.code).toBe('EEXIST');
    expect(posixErrorOf(new DriveWriteError('missing', 'x'))?.code).toBe('ENOENT');
    expect(posixErrorOf(new DriveWriteError('corrupt', 'x'))?.code).toBe('EIO');
    expect(posixErrorOf(new DrivePathError('escape', 'x'))?.code).toBe('ELOOP');
    expect(posixErrorOf(new DrivePathError('not-directory', 'x'))?.code).toBe('ENOTDIR');
    expect(posixErrorOf(new DrivePathError('denied', 'x'))?.code).toBe('EACCES');
    expect(posixErrorOf(new DriveQuotaExceededError('p', 1, 1, 1))?.code).toBe('EDQUOT');
    expect(posixErrorOf(new DriveFreeSpaceError('p', 1, 2))?.code).toBe('ENOSPC');
    expect(posixErrorOf(new DriveFileTooLargeError('p', 1, 20, 10))?.code).toBe('EFBIG');
  });

  it('maps api refusals and node file errors', () => {
    expect(posixErrorOf(new ApiError('forbidden', 'x'))?.code).toBe('EACCES');
    expect(posixErrorOf(new ApiError('not_found', 'x'))?.code).toBe('ENOENT');
    expect(posixErrorOf(new ApiError('rate_limited', 'x'))).toBeUndefined();
    for (const [errno, code] of [
      ['ENOENT', 'ENOENT'],
      ['EROFS', 'EACCES'],
      ['EMLINK', 'EPERM'],
      ['ENOTSUP', 'EOPNOTSUPP'],
      ['EXDEV', 'EXDEV'],
    ] as const) {
      const error = Object.assign(new Error(errno), { code: errno });
      expect(posixErrorOf(error)?.code).toBe(code);
    }
  });

  it('leaves unknown failures alone and keeps a posix error as it is', () => {
    expect(posixErrorOf(new Error('boom'))).toBeUndefined();
    expect(posixErrorOf(Object.assign(new Error('x'), { code: 'EWEIRD' }))).toBeUndefined();
    const own = new PosixError('ESTALE', 'x');
    expect(posixErrorOf(own)).toBe(own);
  });
});

describe('guarded', () => {
  it('turns a known failure into a posix error and lets an unknown one through', async () => {
    await expect(
      guarded(() => Promise.reject(new DriveWriteError('exists', 'x'))),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(
      guarded(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await guarded(() => 5)).toBe(5);
  });
});
