import { ANY, type DeviceQuery } from './device-filter';

export interface DeviceListParams {
  readonly room?: string | undefined;
  readonly status?: string | undefined;
  readonly device?: string | undefined;
}

export const BLANK_QUERY: DeviceQuery = { text: '', room: ANY, kind: ANY, offline: false };

function present(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

export function withParams(query: DeviceQuery, params: DeviceListParams): DeviceQuery {
  const room = present(params.room) ?? ANY;
  const offline = params.status === 'offline';
  const device = present(params.device);
  return query.room === room && query.offline === offline && query.device === device
    ? query
    : { ...query, room, offline, device };
}
