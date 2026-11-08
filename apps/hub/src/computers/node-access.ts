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
import { describeComputer, computerExternalId } from './computer-device';
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

  pair(
    url: string,
    ownerId: string,
  ): { readonly code: string; readonly expires_at: string; readonly url: string } {
    try {
      canonicalEndpoint(url);
    } catch (cause) {
      throw new ApiError('invalid_request', messageOf(cause));
    }
    const code = createPairingCode();
    const expiresAt = new Date(this.now().getTime() + PAIRING_LIFETIME_MS).toISOString();
    this.store.computerNodes.pairing(hashPairingCode(code), url, ownerId, expiresAt);
    return { code, expires_at: expiresAt, url };
  }

  claim(
    code: string,
    hello: NodeHello,
    remote: string,
    windowToken?: string,
  ): {
    readonly paired: {
      readonly token: string;
      readonly device_id: string;
      readonly hub_url: string;
    };
  } {
    this.limit(remote);
    const claimed = this.store.computerNodes.claim(hashPairingCode(code), (hubUrl, createdBy) => {
      const windowClient = this.windowClient(windowToken, createdBy);
      const deviceId = this.device(hello);
      const token = `sen_${randomBytes(32).toString('base64url')}`;
      this.store.computerNodes.bind({
        deviceId,
        machineId: hello.machineId,
        tokenHash: hashNodeToken(token),
        hubUrl,
        windowClientId: windowClient,
        profileId: this.store.clients.find(createdBy)?.profile_id ?? null,
      });
      this.store.computerAi.saveSettings(deviceId, this.store.computerAi.settings(deviceId));
      return { paired: { token, device_id: deviceId, hub_url: hubUrl } };
    });
    if (claimed === null)
      throw new ApiError(
        'pairing_code_invalid',
        'The computer pairing code is unknown, expired or already used.',
      );
    return claimed;
  }

  revoke(deviceId: string): void {
    this.store.computerNodes.revoke(deviceId);
  }

  private windowClient(token: string | undefined, createdBy: string): string | null {
    if (token === undefined) return null;
    const client = this.store.clients.byTokenHash(hashClientToken(token));
    if (client?.id !== createdBy || client.role !== 'owner' || client.platform !== 'desktop') {
      throw new ApiError('forbidden', 'Pair this computer from the owner’s enrolled desktop.');
    }
    return client.id;
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
        (device) =>
          device.provider === 'local' && device.external_id === computerExternalId(hello.machineId),
      );
    if (known !== undefined) return known.id;
    const discovered = describeComputer(hello, [], { power: [], machine: [] });
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
