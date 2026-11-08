import { API_ENDPOINTS as E, type VacuumRoomLinks } from '@smarteverything/domain';
import type { ApiClient } from '../../../../api/connection/client';

export interface LinkRequest {
  readonly mapRoomId: number;
  readonly mapRoomName: string;
  readonly roomId: string;
  readonly move: boolean;
}

export type LinkChange =
  | ({ readonly kind: 'link' } & LinkRequest)
  | { readonly kind: 'create'; readonly mapRoomId: number; readonly mapRoomName: string }
  | { readonly kind: 'unlink'; readonly mapRoomId: number; readonly mapRoomName: string };

export interface LinkPorts {
  readonly client: Pick<ApiClient, 'call'>;
  readonly createRoom: (name: string) => Promise<{ readonly id: string }>;
}

function linkOne(
  ports: LinkPorts,
  deviceId: string,
  request: LinkRequest,
): Promise<VacuumRoomLinks> {
  return ports.client.call(E.setVacuumRoomLink, {
    params: { deviceId, mapRoomId: String(request.mapRoomId) },
    body: { roomId: request.roomId, move: request.move },
  });
}

export async function applyLinkChange(
  ports: LinkPorts,
  deviceId: string,
  change: LinkChange,
): Promise<VacuumRoomLinks> {
  switch (change.kind) {
    case 'link':
      return linkOne(ports, deviceId, change);
    case 'create': {
      const room = await ports.createRoom(change.mapRoomName);
      return linkOne(ports, deviceId, { ...change, roomId: room.id, move: false });
    }
    case 'unlink':
      return ports.client.call(E.removeVacuumRoomLink, {
        params: { deviceId, mapRoomId: String(change.mapRoomId) },
      });
  }
}

export function linkFailureText(change: LinkChange): string {
  return change.kind === 'unlink'
    ? `${change.mapRoomName} was not unlinked`
    : `${change.mapRoomName} was not linked`;
}
