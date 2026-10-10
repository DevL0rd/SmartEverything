import {
  PUSH_COMMAND_KEY,
  PUSH_PAYLOAD_KEY,
  type JsonValue,
  type PushCommand,
} from '@smarteverything/domain';

export interface PushCommandRequest {
  readonly clientId: string;
  readonly command: PushCommand;
  readonly payload: JsonValue;
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
) => Promise<PushCommandOutcome>;

export class PushCommandChannel {
  private sender: PushCommandSender | null = null;

  attach(sender: PushCommandSender): () => void {
    this.sender = sender;
    return () => {
      this.sender = null;
    };
  }

  send(request: PushCommandRequest): Promise<PushCommandOutcome> {
    if (this.sender === null) {
      return Promise.resolve({
        outcome: 'not_configured',
        reason: 'Push messages are not running on this hub.',
      });
    }
    return this.sender(request.clientId, {
      [PUSH_COMMAND_KEY]: request.command,
      [PUSH_PAYLOAD_KEY]: JSON.stringify(request.payload),
    });
  }
}
