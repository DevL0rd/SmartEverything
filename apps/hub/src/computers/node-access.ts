import { createHash, randomBytes } from 'node:crypto';
import {
  ApiError,
  NODE_AI_TOKEN,
  createPairingCode,
  hashPairingCode,
  type NodeHello,
  type ComputerNodeRow,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { describeComputer, computerExternalId } from './computer-device';

const PAIRING_LIFETIME_MS = 10 * 60_000;
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_LIMIT = 10;

export function hashNodeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class ComputerNodeAccess {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
  ) {}

  pair(
    url: string,
    ownerId: string,
  ): { readonly code: string; readonly expires_at: string; readonly url: string } {
    const parsed = new URL(url);
    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.search.length > 0
    )
      throw new ApiError(
        'invalid_request',
        'The hub URL must not contain credentials, a query or a fragment.',
      );
    const code = createPairingCode();
    const expiresAt = new Date(this.now().getTime() + PAIRING_LIFETIME_MS).toISOString();
    this.store.computerNodes.pairing(hashPairingCode(code), url, ownerId, expiresAt);
    return { code, expires_at: expiresAt, url };
  }

  claim(
    code: string,
    hello: NodeHello,
    remote: string,
  ): { readonly token: string; readonly device_id: string; readonly hub_url: string } {
    this.limit(remote);
    const paired = this.store.computerNodes.claim(hashPairingCode(code), (hubUrl) => {
      const previous = this.store.computerNodes.byMachine(hello.machineId);
      if (previous?.revoked_at === null)
        throw new ApiError(
          'conflict',
          'This computer is already paired; revoke its node connection before pairing again.',
        );
      const deviceId = this.device(hello);
      const token = `sen_${randomBytes(32).toString('base64url')}`;
      this.store.computerNodes.bind(deviceId, hello.machineId, hashNodeToken(token), hubUrl);
      this.store.computerAi.saveSettings(deviceId, this.store.computerAi.settings(deviceId));
      return { token, device_id: deviceId, hub_url: hubUrl };
    });
    if (paired === null)
      throw new ApiError(
        'pairing_code_invalid',
        'The computer pairing code is unknown, expired or already used.',
      );
    return paired;
  }

  authenticate(token: string | null): ComputerNodeRow {
    if (token === null || !NODE_AI_TOKEN.safeParse(token).success)
      throw new ApiError(
        'unauthorized',
        'Send this computer service’s own node token as a bearer token.',
      );
    const row = this.store.computerNodes.byToken(hashNodeToken(token));
    if (row === undefined)
      throw new ApiError('unauthorized', 'This computer node token is unknown or revoked.');
    return row;
  }

  private device(hello: NodeHello): string {
    const known = this.store.devices
      .list()
      .find(
        (device) => device.provider === 'local' && device.external_id === computerExternalId(hello),
      );
    if (known !== undefined) return known.id;
    const discovered = describeComputer(hello, [], []);
    const row = this.store.devices.upsert([
      { ...discovered, parentId: null, providerRoom: null, roomId: null, online: false },
    ])[0];
    if (row === undefined)
      throw new ApiError('internal', 'The paired computer device was not persisted.');
    return row.id;
  }

  private limit(remote: string): void {
    const now = this.now().getTime();
    const recent = (this.attempts.get(remote) ?? []).filter((at) => now - at < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIM_LIMIT)
      throw new ApiError('rate_limited', 'Too many computer pairing attempts; wait a minute.');
    this.attempts.set(remote, [...recent, now]);
  }
}
