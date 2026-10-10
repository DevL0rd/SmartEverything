import {
  PUSH_COMMAND_KEY,
  PUSH_COMMANDS_OVER_LIVE,
  PUSH_COMMAND_TTL_SECONDS,
  PUSH_PAYLOAD_KEY,
  WATCH_ACTION_PUSH,
  type JsonValue,
  type PushCommand,
  type PushCommandNotice,
  type WatchActionNotice,
} from '@smarteverything/domain';
import type { LiveReceiver } from '../../server/live-reach';

export interface PushCommandRequest {
  readonly clientId: string;
  readonly command: PushCommand;
  readonly payload: JsonValue;
  readonly collapseKey?: string;
}

export interface PushDelivery {
  readonly ttlSeconds: number;
  readonly collapseKey: string | null;
}

export type PushCommandOutcome =
  | { readonly outcome: 'sent' }
  | {
      readonly outcome: 'not_configured' | 'no_target' | 'failed';
      readonly reason: string;
    };

export type PushCommandSender = (
  clientId: string,
  data: Readonly<Record<string, string>>,
  delivery: PushDelivery,
) => Promise<PushCommandOutcome>;

export type LiveCommandSender = (
  clientId: string,
  notice: PushCommandNotice | WatchActionNotice,
  receiver: LiveReceiver,
) => Promise<number>;

interface LiveRoute {
  readonly notice: PushCommandNotice | WatchActionNotice;
  readonly receiver: LiveReceiver;
}

function legacyWatchRoute(payload: JsonValue): readonly LiveRoute[] {
  const parsed = WATCH_ACTION_PUSH.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  const { requestId, deviceId, action } = parsed.data;
  return [
    {
      notice: { type: 'watch_action', requestId, deviceId, action },
      receiver: 'legacy_watch_action',
    },
  ];
}

function liveRoutes(request: PushCommandRequest): readonly LiveRoute[] {
  if (!PUSH_COMMANDS_OVER_LIVE.includes(request.command)) {
    return [];
  }
  const current: LiveRoute = {
    notice: { type: 'push_command', command: request.command, payload: request.payload },
    receiver: 'push_command',
  };
  return request.command === 'watch_action'
    ? [current, ...legacyWatchRoute(request.payload)]
    : [current];
}

export class PushCommandChannel {
  private sender: PushCommandSender | null = null;
  private live: LiveCommandSender | null = null;

  attachLive(sender: LiveCommandSender): void {
    this.live = sender;
  }

  attach(sender: PushCommandSender): () => void {
    this.sender = sender;
    return () => {
      this.sender = null;
    };
  }

  async send(request: PushCommandRequest): Promise<PushCommandOutcome> {
    if (await this.viaLive(request)) {
      return { outcome: 'sent' };
    }
    if (this.sender === null) {
      return {
        outcome: 'not_configured',
        reason: 'Push messages are not running on this hub.',
      };
    }
    return this.sender(
      request.clientId,
      {
        [PUSH_COMMAND_KEY]: request.command,
        [PUSH_PAYLOAD_KEY]: JSON.stringify(request.payload),
      },
      {
        ttlSeconds: PUSH_COMMAND_TTL_SECONDS[request.command],
        collapseKey: request.collapseKey ?? null,
      },
    );
  }

  private async viaLive(request: PushCommandRequest): Promise<boolean> {
    const { live } = this;
    if (live === null) {
      return false;
    }
    const reached = await Promise.all(
      liveRoutes(request).map((route) => live(request.clientId, route.notice, route.receiver)),
    );
    return reached.some((count) => count > 0);
  }
}
