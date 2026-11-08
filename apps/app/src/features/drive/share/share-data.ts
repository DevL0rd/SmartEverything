import type { QueryClient } from '@tanstack/react-query';
import type { DriveShareCreate, DriveShareCreated } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createDriveShare } from '../../../api/drive';
import { SHARES_PREFIX } from '../shared/revoke-link';

const log = new Logger('app.drive');

export async function makeShareLink(
  client: QueryClient,
  request: DriveShareCreate,
): Promise<DriveShareCreated> {
  const created = await createDriveShare(request);
  log.info('share_link.created', {
    shareId: created.share.id,
    itemId: request.itemId,
    permission: request.permission,
    ends: request.expiresAt !== null,
    password: request.password !== null,
    public: created.public,
  });
  await client.invalidateQueries({ queryKey: SHARES_PREFIX });
  return created;
}
