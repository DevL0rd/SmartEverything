import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HomeMapScanStored } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { HOME_MAP_QUERY_KEY } from './home-map-query';
import { ScanUploads, type ScanTransport, type ScanUploadRequest } from './scan-upload';

export async function sendScan(request: ScanUploadRequest): Promise<HomeMapScanStored> {
  const body = await request.file.blob();
  return api().upload(
    E.uploadHomeMapScan,
    {
      params: { mapId: request.mapId },
      query: { format: request.format, name: request.file.name },
    },
    body,
    { signal: request.signal, onProgress: request.onProgress },
  );
}

function isMap(data: unknown, mapId: string): boolean {
  return typeof data === 'object' && data !== null && 'id' in data && data.id === mapId;
}

export function refreshStoredMap(client: QueryClient, mapId: string): void {
  background(
    client.invalidateQueries({
      queryKey: HOME_MAP_QUERY_KEY,
      predicate: (query) => isMap(query.state.data, mapId),
    }),
    'home_map.scan_refresh_failed',
  );
}

const shared = new WeakMap<QueryClient, ScanUploads>();

export function scanUploadsFor(
  client: QueryClient,
  transport: ScanTransport = sendScan,
): ScanUploads {
  const known = shared.get(client);
  if (known !== undefined) return known;
  const uploads = new ScanUploads(transport, (mapId) => {
    refreshStoredMap(client, mapId);
  });
  shared.set(client, uploads);
  return uploads;
}

export function useScanUploads(): ScanUploads {
  return scanUploadsFor(useQueryClient());
}
