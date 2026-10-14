import WebSocket from 'ws';
import { NodeHarnessError } from './harness-binding';
import {
  NODE_HARNESS_PATH,
  NODE_HARNESS_FRAME,
  type AiSubscriptionHostStatus,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
export function harnessSocketUrl(hubUrl: string, log: Logger): URL | null {
  const hub = new URL(hubUrl);
  if (
    (hub.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(hub.hostname)) ||
    hub.username !== '' ||
    hub.password !== '' ||
    hub.search !== '' ||
    hub.hash !== ''
  ) {
    log.warn('harness.unavailable', {
      reason:
        'Computer execution requires a credential-free HTTPS hub URL; HTTP is allowed only on loopback.',
    });
    return null;
  }
  const url = new URL(NODE_HARNESS_PATH, hub);
  url.protocol = hub.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
}
export function publishHarnessSubscription(
  socket: WebSocket,
  current: WebSocket | null,
  binding: {
    readonly device_id: string;
    readonly generation: string;
    readonly runtime_instance: string;
  },
  status: AiSubscriptionHostStatus,
): Promise<void> {
  if (current !== socket || socket.readyState !== WebSocket.OPEN)
    throw new NodeHarnessError('Subscription supplying host disconnected.');
  socket.send(
    JSON.stringify(
      NODE_HARNESS_FRAME.parse({
        device_id: binding.device_id,
        generation: binding.generation,
        runtime_instance: binding.runtime_instance,
        type: 'harness_subscription_status',
        status,
      }),
    ),
  );
  return Promise.resolve();
}
