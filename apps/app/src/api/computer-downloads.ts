import { API_ENDPOINTS as E, type ComputerDownload } from '@smarteverything/domain';
import { api } from './transport';

export interface PreparedDownload {
  readonly download: ComputerDownload;
  readonly url: string;
}

export async function prepareComputerDownload(
  deviceId: string,
  paths: readonly string[],
): Promise<PreparedDownload> {
  const client = api().forMedia();
  const download = await client.call(E.prepareComputerDownload, {
    params: { deviceId },
    body: { paths: [...paths] },
  });
  return {
    download,
    url: await client.resourceUrl(download.url, download.expiresAt, 'attachment'),
  };
}
