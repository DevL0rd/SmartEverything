import { posix, win32 } from 'node:path';
import type { DshSessionHeader } from '@smarteverything/domain';
import type { DshSessionPrincipal } from './dsh-session-claims';
import { DshSessionStorageError } from './dsh-session-errors';

export function requireNativeHeader(
  header: DshSessionHeader,
  principal: DshSessionPrincipal,
): void {
  if (header.cwd === undefined) return;
  const paths = principal.platform === 'windows' ? win32 : posix;
  if (!paths.isAbsolute(header.cwd)) {
    throw new DshSessionStorageError(
      header.id,
      'corruption',
      `the original cwd must be absolute on its authenticated ${principal.platform} host`,
    );
  }
}
