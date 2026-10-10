import type { McpTokenRow, OAuthClientRow } from '@smarteverything/domain';
import { relative } from '../../../format/time';
import { ownsToken, type Assistant } from './assistants';

export interface AssistantStatus {
  readonly connected: boolean;
  readonly text: string;
}

const NOT_SET_UP: AssistantStatus = { connected: false, text: 'Not set up' };

function lastUse(tokens: readonly McpTokenRow[]): string | null {
  return tokens.reduce<string | null>((latest, token) => {
    if (token.last_used_at === null) {
      return latest;
    }
    return latest === null || token.last_used_at > latest ? token.last_used_at : latest;
  }, null);
}

export function assistantStatus(
  assistant: Assistant,
  clients: readonly OAuthClientRow[],
  tokens: readonly McpTokenRow[],
  now: number,
): AssistantStatus {
  if (assistant.kind === 'oauth') {
    const connected = clients.some((client) => assistant.clientName.test(client.name));
    return connected ? { connected, text: 'Connected' } : NOT_SET_UP;
  }
  const own = tokens.filter(
    (token) => token.revoked_at === null && ownsToken(assistant, token.name),
  );
  if (own.length === 0) {
    return NOT_SET_UP;
  }
  const used = lastUse(own);
  return {
    connected: true,
    text: used === null ? 'Connected · not used yet' : `Connected · used ${relative(used, now)}`,
  };
}
