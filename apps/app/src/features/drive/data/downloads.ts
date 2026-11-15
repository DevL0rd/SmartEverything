import { API_ENDPOINTS as E, type DriveDownload } from '@smarteverything/domain';
import { api } from '../../../api/transport';

export interface PreparedDriveDownload {
  readonly download: DriveDownload;
  readonly url: string;
}

export async function prepareDriveDownload(
  itemIds: readonly string[],
): Promise<PreparedDriveDownload> {
  const client = api().forMedia();
  const download = await client.call(E.prepareDriveDownload, {
    body: { itemIds: [...itemIds] },
  });
  return {
    download,
    url: await client.resourceUrl(download.url, download.expiresAt, 'attachment'),
  };
}
