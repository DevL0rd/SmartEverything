import { createHash, randomBytes } from 'node:crypto';
import {
  ApiError,
  NODE_AI_TOKEN,
  createClientToken,
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
  ): {
    readonly paired: {
      readonly token: string;
      readonly device_id: string;
      readonly hub_url: string;
      readonly window_token: string;
    };
    readonly replacedWindow: string | null;
  } {
    this.limit(remote);
    const claimed = this.store.computerNodes.claim(hashPairingCode(code), (hubUrl) => {
      const replacedWindow =
        this.store.computerNodes.byMachine(hello.machineId)?.window_client_id ?? null;
      if (replacedWindow !== null) this.store.clients.remove(replacedWindow);
      const deviceId = this.device(hello);
      const token = `sen_${randomBytes(32).toString('base64url')}`;
      const windowToken = createClientToken();
      const windowClient = this.store.clients.create({
        name: `${hello.hostname} desktop`.slice(0, 80),
        platform: 'web',
        role: 'owner',
        tokenHash: hashClientToken(windowToken),
      });
      this.store.computerNodes.bind({
        deviceId,
        machineId: hello.machineId,
        tokenHash: hashNodeToken(token),
        hubUrl,
        windowClientId: windowClient.id,
      });
      this.store.computerAi.saveSettings(deviceId, this.store.computerAi.settings(deviceId));
      return {
        paired: { token, device_id: deviceId, hub_url: hubUrl, window_token: windowToken },
        replacedWindow,
      };
    });
    if (claimed === null)
      throw new ApiError(
        'pairing_code_invalid',
        'The computer pairing code is unknown, expired or already used.',
      );
    return claimed;
  }

  revoke(deviceId: string): string | null {
    const windowClient = this.store.computerNodes.revoke(deviceId);
    if (windowClient !== null) this.store.clients.remove(windowClient);
    return windowClient;
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
    const discovered = describeComputer(hello, 'pc', [], { power: [], machine: [] });
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
