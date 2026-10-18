import {
  API_ENDPOINTS,
  MACHINE_UPDATE_QUERY,
  apiErrorOf,
  encodeQuery,
  type DesktopServer,
  type MachineUpdateOffer,
  type MachineUpdateQuery,
} from '@smarteverything/domain';

export function updateTargetOf(platform: string, arch: string): MachineUpdateQuery | null {
  const target = MACHINE_UPDATE_QUERY.safeParse({ platform, arch });
  return target.success ? target.data : null;
}

export async function readOffer(
  server: DesktopServer,
  target: MachineUpdateQuery,
  fetchFrom: typeof fetch,
): Promise<MachineUpdateOffer | null> {
  const endpoint = API_ENDPOINTS.readMachineUpdate;
  const url = new URL(`${endpoint.path}${encodeQuery(target)}`, server.url);
  const response = await fetchFrom(url, {
    method: endpoint.method,
    headers: { authorization: `Bearer ${server.token}` },
  });
  const body: unknown = await response.json();
  if (!response.ok) throw apiErrorOf(response.status, body);
  return endpoint.response.parse(body);
}
