import { SUBSCRIPTION_CREDENTIAL } from '../credentials/contracts';
import type { SubscriptionCredential, ClaudeAccountIdentity } from '../credentials/contracts';
import { ClaudeOAuthProfile } from '../authorization/claude-profile';
import type { ClaudeProfilePort } from '../authorization/claude-profile';
import { claudeBilling } from './claude-billing';
import { codexBilling } from './codex-billing';
import type { CodexAdmissionProof } from './codex-admission';
import type { PlanOnlyAdmission, SubscriptionAdmissionPort } from './admission';

const SNAPSHOT_LIFETIME_MS = 30_000;
export interface SubscriptionBillingSnapshot {
  readonly state: 'disabled' | 'paid_usage_enabled' | 'quota_exhausted' | 'unavailable';
  readonly message: string;
  readonly checkedAt: number;
  readonly expiresAt: number;
  readonly identity?: ClaudeAccountIdentity;
  readonly codexProof?: CodexAdmissionProof;
}
export class SubscriptionBillingAdmission implements SubscriptionAdmissionPort {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly claudeProfile: ClaudeProfilePort = new ClaudeOAuthProfile(fetcher),
  ) {}
  async inspect(
    credential: SubscriptionCredential,
    signal: AbortSignal,
  ): Promise<SubscriptionBillingSnapshot> {
    const checkedAt = Date.now();
    const fields = {
      checkedAt,
      expiresAt:
        credential.kind === 'codex-subscription'
          ? Math.min(checkedAt + SNAPSHOT_LIFETIME_MS, credential.expires)
          : checkedAt + SNAPSHOT_LIFETIME_MS,
    };
    if (credential.kind === 'chatgpt-subscription')
      return {
        ...fields,
        state: 'unavailable',
        message:
          'Sign in with ChatGPT direct scope is available, but its paid-credit policy cannot currently be read. Select Codex OAuth explicitly to use its separate subscription transport.',
      };
    try {
      const assessment =
        credential.kind === 'claude-subscription'
          ? await claudeBilling(credential, signal, this.claudeProfile, this.fetcher)
          : await codexBilling(credential, signal, this.fetcher);
      signal.throwIfAborted();
      if (Date.now() >= fields.expiresAt)
        throw new Error('Subscription billing proof expired during discovery.');
      return { ...fields, ...assessment };
    } catch (cause) {
      signal.throwIfAborted();
      if (!(cause instanceof Error)) throw cause;
      return {
        ...fields,
        state: 'unavailable',
        message:
          'The supplying account billing snapshot could not be verified. Missing, changed or rejected provider usage fields block subscription inference.',
      };
    }
  }
  async verify(
    credential: SubscriptionCredential,
    signal: AbortSignal,
  ): Promise<PlanOnlyAdmission> {
    const frozen = SUBSCRIPTION_CREDENTIAL.parse(credential);
    const snapshot = await this.inspect(frozen, signal);
    if (snapshot.state !== 'disabled') return { state: 'unavailable', reason: snapshot.message };
    return {
      state: 'verified',
      provider: frozen.kind,
      generation: frozen.generation,
      hostId: frozen.hostId,
      expires: snapshot.expiresAt,
      evidence: snapshot.message,
      ...(snapshot.identity === undefined ? {} : { identity: snapshot.identity }),
      ...(snapshot.codexProof === undefined ? {} : { codexProof: snapshot.codexProof }),
    };
  }
}
