import type { SubscriptionCredential } from '../credentials/contracts';
import type { SubscriptionCredentials } from '../credentials/service';
import { SubscriptionProviderError } from '../providers/errors';
import { CodexAuthorization } from './codex';
import { CodexIdentityChangedError } from './codex-identity';
import { ClaudeAuthorization } from './claude';
import { SiwcAuthorization } from './siwc';
import { SubscriptionHttpError } from './http';
import { assertPlanScope } from './siwc-contracts';
import { ClaudeOAuthProfile, ClaudeAccountChangedError } from './claude-profile';
import type { ClaudeProfilePort } from './claude-profile';

const REFRESH_MARGIN_MS = 6 * 60 * 1000;

export class SubscriptionAuthorization {
  readonly claude: ClaudeAuthorization;
  readonly chatgpt: SiwcAuthorization;
  readonly codex: CodexAuthorization;

  constructor(
    readonly credentials: SubscriptionCredentials,
    fetcher: typeof fetch = fetch,
    readonly claudeProfile: ClaudeProfilePort = new ClaudeOAuthProfile(fetcher),
  ) {
    this.claude = new ClaudeAuthorization(credentials, claudeProfile);
    this.chatgpt = new SiwcAuthorization(credentials, fetcher);
    this.codex = new CodexAuthorization(credentials);
  }

  async resolve(routeId: string, signal: AbortSignal): Promise<SubscriptionCredential> {
    const stored = await this.credentials.read(routeId);
    if (stored === undefined)
      throw new SubscriptionProviderError(
        'AUTH_REQUIRED',
        'Selected model route requires its own local OAuth subscription authorization.',
      );
    if (stored.kind === 'chatgpt-subscription') assertPlanScope(stored.scopes.join(' '));
    if (stored.expires > Date.now() + REFRESH_MARGIN_MS) return stored;
    const outcome = await this.credentials.modify(
      routeId,
      async (current) => {
        if (current?.generation !== stored.generation)
          throw new SubscriptionProviderError(
            'AUTH_INVALID',
            'Subscription account changed before refresh acquired ownership.',
          );
        if (current.expires > Date.now() + REFRESH_MARGIN_MS)
          return { credential: current, result: current };
        try {
          const next =
            current.kind === 'claude-subscription'
              ? await this.claude.refresh(current, signal)
              : current.kind === 'codex-subscription'
                ? await this.codex.refresh(current, signal)
                : await this.chatgpt.refresh(current, signal);
          return { credential: next, result: next };
        } catch (error) {
          if (terminalSubscriptionRefresh(error))
            return { credential: undefined, result: undefined };
          throw error;
        }
      },
      signal,
    );
    if (outcome === undefined)
      throw new SubscriptionProviderError(
        'AUTH_REQUIRED',
        'Selected subscription session is no longer usable. Sign in again.',
      );
    return outcome;
  }
}

function terminalSubscriptionRefresh(error: unknown): boolean {
  return (
    error instanceof ClaudeAccountChangedError ||
    error instanceof CodexIdentityChangedError ||
    (error instanceof SubscriptionHttpError && error.terminalRefresh)
  );
}
