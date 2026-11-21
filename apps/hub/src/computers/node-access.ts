import { createHash, randomBytes } from 'node:crypto';
import {
  ApiError,
  NODE_AI_TOKEN,
  createPairingCode,
  hashClientToken,
  hashPairingCode,
  type NodeHello,
  type ComputerNodeRow,
} from '@smarteverything/domain';
import { canonicalEndpoint } from '../client-network/route-trust';
import type { Store } from '../store/store';
import { messageOf } from '@smarteverything/logging';

const PAIRING_LIFETIME_MS = 10 * 60_000;
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_LIMIT = 10;

function hashNodeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class ComputerNodeAccess {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
  ) {}

  async pair(
    url: string,
    ownerId: string,
  ): Promise<{ readonly code: string; readonly expires_at: string; readonly url: string }> {
    try {
      canonicalEndpoint(url);
    } catch (cause) {
      throw new ApiError('invalid_request', messageOf(cause));
    }
    const code = createPairingCode();
    const expiresAt = new Date(this.now().getTime() + PAIRING_LIFETIME_MS).toISOString();
    await this.store.host.call(
      'computerNodes',
      'pairing',
      hashPairingCode(code),
      url,
      ownerId,
      expiresAt,
    );
    return { code, expires_at: expiresAt, url };
  }

  async claim(
    code: string,
    hello: NodeHello,
    remote: string,
    windowToken?: string,
  ): Promise<{
    readonly paired: {
      readonly token: string;
      readonly device_id: string;
      readonly hub_url: string;
    };
  }> {
    this.limit(remote);
    const token = `sen_${randomBytes(32).toString('base64url')}`;
    const claimed = await this.store.host.write('computerNodeClaim', {
      codeHash: hashPairingCode(code),
      hello,
      windowTokenHash: windowToken === undefined ? null : hashClientToken(windowToken),
      tokenHash: hashNodeToken(token),
    });
    if (claimed === null)
      throw new ApiError(
        'pairing_code_invalid',
        'The computer pairing code is unknown, expired or already used.',
      );
    this.store.live.computers.claimed(claimed.deviceId);
    await this.store.live.computerAccess.claimed(claimed.deviceId);
    return { paired: { token, device_id: claimed.deviceId, hub_url: claimed.hubUrl } };
  }

  async revoke(deviceId: string): Promise<void> {
    await this.store.live.computerAccess.revoke(deviceId);
  }

  async authenticate(token: string | null): Promise<ComputerNodeRow> {
    if (token === null || !NODE_AI_TOKEN.safeParse(token).success)
      throw new ApiError(
        'unauthorized',
        'Send this computer service’s own node token as a bearer token.',
      );
    const row = await this.store.host.call('computerNodes', 'byToken', hashNodeToken(token));
    if (row === undefined)
      throw new ApiError('unauthorized', 'This computer node token is unknown or revoked.');
    return row;
  }

  private limit(remote: string): void {
    const now = this.now().getTime();
    const recent = (this.attempts.get(remote) ?? []).filter((at) => now - at < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIM_LIMIT)
      throw new ApiError('rate_limited', 'Too many computer pairing attempts; wait a minute.');
    this.attempts.set(remote, [...recent, now]);
  }
}
