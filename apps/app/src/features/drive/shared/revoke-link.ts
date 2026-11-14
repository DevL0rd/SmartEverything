import type { QueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { revokeDriveShare } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { DRIVE_PREFIX } from '../../../queries/keys';

const log = new Logger('app.drive');

export const SHARES_PREFIX = [...DRIVE_PREFIX, 'shares'] as const;

export const SHARED_BY_ME_PREFIX = [...DRIVE_PREFIX, 'shared-by-me'] as const;

export async function refreshLinks(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: SHARES_PREFIX }),
    client.invalidateQueries({ queryKey: SHARED_BY_ME_PREFIX }),
  ]);
}

export function revokeQuestionOf(title: string): ConfirmRequest {
  return {
    title: `Stop the link to ${title}?`,
    body: 'People with the link can’t open it any more.',
    confirmLabel: 'Stop link',
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
  await refreshLinks(client);
  return true;
}
