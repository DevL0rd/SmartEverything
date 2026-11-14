import type { QueryClient } from '@tanstack/react-query';
import type { DriveSharedByMeEntry } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { removeDriveGrant, revokeDriveShare } from '../../../api/drive';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { refreshLinks } from './revoke-link';
import { activeLinksOf } from './shared-model';

const log = new Logger('app.drive');

export function stopQuestionOf(name: string): ConfirmRequest {
  return {
    title: `Stop sharing ${name}?`,
    body: 'The people it is shared with lose access and its links stop opening.',
    confirmLabel: 'Stop sharing',
    cancelLabel: 'Keep sharing',
    tone: 'destructive',
  };
}

export async function stopSharing(
  client: QueryClient,
  entry: DriveSharedByMeEntry,
  now: number,
): Promise<boolean> {
  const accepted = await confirm(stopQuestionOf(entry.item.name));
  if (!accepted) return false;
  const links = activeLinksOf(entry, now);
  await Promise.all([
    ...entry.grants.map((grant) => removeDriveGrant(grant.id)),
    ...links.map((link) => revokeDriveShare(link.id)),
  ]);
  log.info('sharing.stopped', {
    itemId: entry.item.id,
    people: entry.grants.length,
    links: links.length,
  });
  await refreshLinks(client);
  return true;
}
