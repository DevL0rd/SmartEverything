import { randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ApiError,
  CLIENT_TOKEN,
  createClientToken,
  createPairingCode,
  hashClientToken,
  hashPairingCode,
  type ClientRow,
  type Pairing,
  type Role,
} from '@smarteverything/domain';
import { OWNER_CLIENT_NAME } from '../store/repositories/clients';
import type { Store } from '../store/store';

export const OWNER_TOKEN_FILE = 'owner-token';

const PAIRING_LIFETIME_MS = 10 * 60_000;

const CLAIMS_PER_WINDOW = 10;
const CLAIM_WINDOW_MS = 60_000;

export interface AccessOptions {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly now: () => Date;
  readonly ownerChanged: (clientId: string) => void;
}

export interface Claim {
  readonly code: string;
  readonly name: string;
  readonly platform: ClientRow['platform'];
  readonly remote: string;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class AccessService {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly options: AccessOptions) {}

  get ownerTokenPath(): string {
    return join(this.options.dataDirectory, OWNER_TOKEN_FILE);
  }

  async ensureOwner(): Promise<string> {
    const owner = this.options.store.clients.owner();
    const written = await this.writtenToken();
    if (owner === undefined) {
      const token = createClientToken();
      await this.writeToken(token);
      this.options.store.clients.create(
        {
          name: OWNER_CLIENT_NAME,
          platform: 'desktop',
          role: 'owner',
          tokenHash: hashClientToken(token),
        },
        true,
      );
      return token;
    }
    if (
      written !== null &&
      this.options.store.clients.byTokenHash(hashClientToken(written))?.id === owner.id
    ) {
      return written;
    }
    return this.rotateOwner();
  }

  async rotateOwner(): Promise<string> {
    const owner = this.options.store.clients.owner();
    if (owner === undefined) {
      throw new ApiError('conflict', 'There is no desktop owner to rotate the token of.');
    }
    const token = createClientToken();
    await this.writeToken(token);
    this.options.store.clients.replaceToken(owner.id, hashClientToken(token));
    this.options.ownerChanged(owner.id);
    return token;
  }

  startPairing(role: Role, createdBy: string): Pairing {
    const settings = this.options.store.settings.read();
    if (settings.public_url === null || settings.public_url_verified_at === null) {
      throw new ApiError(
        'public_url_not_verified',
        'Set and verify the public URL in Remote access before pairing a phone; the phone reaches this computer through it.',
      );
    }
    const now = this.options.now();
    this.options.store.clients.forgetPairingsBefore(now.toISOString());
    const code = createPairingCode();
    const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS).toISOString();
    this.options.store.clients.addPairing(hashPairingCode(code), role, createdBy, expiresAt);
    return { code, expiresAt, qr: { url: settings.public_url, code } };
  }

  claim(claim: Claim): { token: string; client: ClientRow } {
    this.limit(claim.remote);
    const outcome = this.options.store.clients.claimPairing(hashPairingCode(claim.code));
    if (!outcome.claimed) {
      throw new ApiError(
        'pairing_code_invalid',
        `That pairing code is ${outcome.reason === 'unknown' ? 'not known' : outcome.reason}; make a new one on the desktop.`,
      );
    }
    const token = createClientToken();
    const client = this.options.store.clients.create({
      name: claim.name,
      platform: claim.platform,
      role: outcome.role,
      tokenHash: hashClientToken(token),
    });
    return { token, client };
  }

  private limit(remote: string): void {
    const now = this.options.now().getTime();
    const recent = (this.attempts.get(remote) ?? []).filter((at) => now - at < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIMS_PER_WINDOW) {
      throw new ApiError('rate_limited', 'Too many pairing attempts; wait a minute and try again.');
    }
    this.attempts.set(remote, [...recent, now]);
  }

  private async writtenToken(): Promise<string | null> {
    try {
      const text = (await readFile(this.ownerTokenPath, 'utf8')).trim();
      return CLIENT_TOKEN.safeParse(text).success ? text : null;
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  private async writeToken(token: string): Promise<void> {
    const temporary = `${this.ownerTokenPath}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, `${token}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, this.ownerTokenPath);
  }
}
