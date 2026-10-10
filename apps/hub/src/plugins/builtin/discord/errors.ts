import { DiscordRequestError } from './link';

export class DiscordPolicyError extends Error {
  override readonly name = 'DiscordPolicyError';
}

export class UncertainOutcomeError extends Error {
  override readonly name = 'UncertainOutcomeError';
}

export class DiscordInputError extends Error {
  override readonly name = 'DiscordInputError';
}

export function outcomeUnknown(cause: unknown): boolean {
  return (
    cause instanceof UncertainOutcomeError ||
    (cause instanceof DiscordRequestError && cause.uncertain)
  );
}
