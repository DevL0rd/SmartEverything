import { ValueStore } from '../../../design/external-store';
import {
  AI_HARNESS_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  LIVE_CLIENT_MESSAGE,
  LIVE_SERVER_MESSAGE,
  liveProtocols,
  type AiPreviewLease,
  type AiHtmlPreviewLease,
} from '@smarteverything/domain';
import { connectionState } from '../../../api/connection/connection';
import { openHubSocket, type HubSocket } from '../../../api/connection/hub-socket';
import type { ServerConnection } from '../../../api/connection/storage';
type GatewayLease = AiPreviewLease | AiHtmlPreviewLease;
const owners = new Map<string, HubSocket>();
export const retiredGatewayLease = new ValueStore<string | null>(null);
const ADMISSION_MS = 15_000;
class PreviewOwnerError extends Error {
  override readonly name = 'PreviewOwnerError';
}
export function previewOwnerConnection(): ServerConnection {
  const state = connectionState.get();
  if (state.status !== 'paired')
    throw new PreviewOwnerError('Preview ownership requires its paired server.');
  return state.connection;
}
export async function ownGatewayLease<T extends GatewayLease>(
  connection: ServerConnection,
  chatId: string,
  lease: T,
): Promise<T> {
  if (lease.expires_at !== null) return lease;
  if (owners.has(lease.origin))
    throw new PreviewOwnerError('This preview already has a browser owner.');
  const socket = openHubSocket(connection, '/live', liveProtocols(connection.token));
  owners.set(lease.origin, socket);
  await admitOwner(socket, { chatId, lease });
  return lease;
}
function admitOwner(
  socket: HubSocket,
  owner: { readonly chatId: string; readonly lease: GatewayLease },
): Promise<void> {
  const channel = socket;
  return new Promise((resolve, reject) => {
    const fail = (cause: Error): void => {
      clearTimeout(timer);
      if (owners.get(owner.lease.origin) === socket) {
        owners.delete(owner.lease.origin);
        retiredGatewayLease.set(owner.lease.origin);
      }
      socket.close();
      reject(cause);
    };
    const timer = setTimeout(() => {
      fail(new PreviewOwnerError('The browser owner admission timed out.'));
    }, ADMISSION_MS);
    channel.onopen = (): void => {
      socket.send(
        JSON.stringify(
          LIVE_CLIENT_MESSAGE.parse({
            type: 'subscribe',
            tables: [],
            streams: [],
            capabilities: [AI_HARNESS_CAPABILITY, AI_PREVIEW_CAPABILITY],
            previewOwner: owner,
          }),
        ),
      );
    };
    channel.onmessage = (event): void => {
      readOwner(
        event.data,
        (): void => {
          clearTimeout(timer);
          resolve();
        },
        fail,
      );
    };
    channel.onclose = (): void => {
      fail(new PreviewOwnerError('The paired browser owner disconnected.'));
    };
    channel.onerror = (): void => {
      fail(new PreviewOwnerError('The paired browser owner transport failed.'));
    };
  });
}
export function closeGatewayLease(lease: GatewayLease): void {
  const socket = owners.get(lease.origin);
  owners.delete(lease.origin);
  socket?.close();
}

function readOwner(data: unknown, accepted: () => void, fail: (cause: Error) => void): void {
  try {
    if (typeof data !== 'string')
      throw new PreviewOwnerError('The browser owner response must be JSON.');
    const raw: unknown = JSON.parse(data);
    const value = LIVE_SERVER_MESSAGE.parse(raw);
    if (value.type === 'refused') throw new PreviewOwnerError(value.error.message);
    if (value.type === 'subscribed') accepted();
  } catch (cause) {
    fail(cause instanceof Error ? cause : new PreviewOwnerError('Browser owner admission failed.'));
  }
}
