import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type ProviderTurn, type JsonValue } from '@smarteverything/domain';
import { ProviderInputError } from './input';
export function requireSubscription(
  account: Awaited<ReturnType<Query['initializationResult']>>['account'],
): void {
  const hasPlan = account.subscriptionType !== undefined && account.subscriptionType !== '';
  const provider = account.apiProvider === undefined || account.apiProvider === 'firstParty';
  const source =
    account.apiKeySource === undefined ||
    account.apiKeySource === 'none' ||
    account.apiKeySource === 'oauth';
  if (!hasPlan || !provider || !source) {
    throw new ProviderInputError(
      'Sign into the official Claude CLI locally with a Claude subscription. API-key or third-party provider authentication cannot supply this computer provider.',
    );
  }
}

export function turnScope(turn: ProviderTurn): string {
  return JSON.stringify({
    chat_id: turn.chat_id,
    managed_project: turn.managed_project,
    profile_id: turn.profile_id,
    device_id: turn.device_id,
    tools: turn.tools,
    options: turn.options,
    system: turn.system,
  });
}

export function serializableServerResult(value: unknown): JsonValue {
  const json: unknown = JSON.parse(JSON.stringify(value));
  return JSON_VALUE.parse(json);
}
