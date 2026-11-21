import type { AssistantMessageRow, LiveStream } from '@smarteverything/domain';
import type { PushClient } from './push-units';

export interface ReplyAudienceDeps {
  readonly asker: (messageId: string) => AssistantMessageRow | undefined;
  readonly listening: (clientId: string, stream: LiveStream) => boolean;
  readonly callOpen: (callMessageId: string) => boolean;
}

export type Audience = (client: PushClient) => boolean;

const NOBODY: Audience = () => false;

function answeredWhereAsked(asker: AssistantMessageRow, deps: ReplyAudienceDeps): boolean {
  const source = asker.origin?.source;
  if (source === 'plugin') {
    return true;
  }
  if (source === 'voice') {
    return deps.callOpen(asker.id);
  }
  return asker.client_id !== null && deps.listening(asker.client_id, 'assistant');
}

export function replyAudience(row: AssistantMessageRow, deps: ReplyAudienceDeps): Audience {
  const asker = row.reply_to === null ? undefined : deps.asker(row.reply_to);
  if (asker !== undefined && answeredWhereAsked(asker, deps)) {
    return NOBODY;
  }
  return (client) =>
    client.profileId === row.profile_id && !deps.listening(client.clientId, 'assistant');
}
