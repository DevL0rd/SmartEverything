import type {
  JsonValue,
  Provider,
  ProviderAdapter,
  ProviderCredentials,
  ProviderProblem,
  ProviderPrompt,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface StoredAccount {
  readonly label: string;
  readonly secrets: Readonly<Record<string, JsonValue>>;
}

export class ProviderProblemError extends Error {
  override readonly name = 'ProviderProblemError';

  constructor(
    readonly problem: ProviderProblem,
    override readonly cause: Error,
  ) {
    super(cause.message);
  }
}

export interface ShownPrompt {
  readonly answer: Promise<string>;
  readonly dismiss: () => Promise<void>;
}

export interface LinkContext {
  readonly log: Logger;
  readonly dataDirectory: string;
  readonly stored?: StoredAccount;
  readonly ask: (prompt: ProviderPrompt) => Promise<string>;
  readonly show: (prompt: ProviderPrompt) => Promise<ShownPrompt>;
}

export interface RunContext extends LinkContext {
  readonly saveAccount: (account: StoredAccount) => Promise<void>;
  readonly needsAttention: (cause: Error) => Promise<void>;
}

export interface ProviderModule<P extends Provider> {
  readonly provider: P;
  readonly link: (
    credentials: Extract<ProviderCredentials, { provider: P }>,
    context: LinkContext,
  ) => Promise<StoredAccount>;
  readonly start: (account: StoredAccount, context: RunContext) => Promise<ProviderAdapter>;
  readonly labelOf?: (account: StoredAccount) => string;
  readonly forget?: (account: StoredAccount, context: LinkContext) => Promise<void>;
}
