import type { QueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { revokeDriveShare } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { DRIVE_PREFIX } from '../../../queries/keys';

const log = new Logger('app.drive');

export const SHARES_PREFIX = [...DRIVE_PREFIX, 'shares'] as const;

export function revokeQuestionOf(title: string): ConfirmRequest {
  return {
    title: `Revoke ${title}?`,
    body: 'People with the link can’t open it any more.',
    confirmLabel: 'Revoke link',
    cancelLabel: 'Keep link',
    tone: 'destructive',
  };
}

export async function revokeLink(
  client: QueryClient,
  shareId: string,
  title: string,
): Promise<boolean> {
  const accepted = await confirm(revokeQuestionOf(title));
  if (!accepted) return false;
  await revokeDriveShare(shareId);
  log.info('share_link.revoked', { shareId });
  await client.invalidateQueries({ queryKey: SHARES_PREFIX });
  return true;
}
