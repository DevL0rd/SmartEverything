import {
  API_ENDPOINTS,
  DESKTOP_UPDATE_PRODUCT,
  MACHINE_UPDATE_QUERY,
  apiErrorOf,
  encodeQuery,
  type DesktopServer,
  type MachineUpdateOffer,
  type MachineUpdateQuery,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { UpdateServerRefusedError } from './update-errors.js';

const log = new Logger('desktop.update');

export function updateTargetOf(platform: string, arch: string): MachineUpdateQuery | null {
  const target = MACHINE_UPDATE_QUERY.safeParse({
    product: DESKTOP_UPDATE_PRODUCT,
    platform,
    arch,
  });
  return target.success ? target.data : null;
}

async function refusalOf(response: Response): Promise<Error> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    log.warn('update.offer_error_not_json', { status: response.status, reason: messageOf(cause) });
    return new UpdateServerRefusedError('the update offer', response.status);
  }
  return apiErrorOf(response.status, body);
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
  if (!response.ok) throw await refusalOf(response);
  const body: unknown = await response.json();
  return endpoint.response.parse(body);
}
