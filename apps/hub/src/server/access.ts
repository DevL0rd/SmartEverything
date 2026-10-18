import type { HubConnections } from '../network/connections';
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
  pairingProof,
  isExpired,
  type ClientRow,
  type HubConnectionMetadata,
  type Pairing,
  PROFILE_NAME_MAX,
  type Role,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { remoteKind } from './request-trace';
import { AccessLifecycle } from './access-lifecycle';
import { assertMemberPerson, refusal } from './person-access';
import { OWNER_CLIENT_NAME } from '../store/repositories/clients';
import type { Store } from '../store/store';
import { isMissing } from '../fs-util';
import type { KnownStanding } from '../store/repositories/person-access';

export const OWNER_TOKEN_FILE = 'owner-token';

const log = new Logger('hub.pairing');

const INVALID_CODE = 'That pairing code is not known; make a new one on the desktop.';

const PAIRING_LIFETIME_MS = 10 * 60_000;

const CLAIMS_PER_WINDOW = 10;
const CLAIM_WINDOW_MS = 60_000;

export interface AccessOptions {
  readonly connections?: HubConnections;
  readonly store: Store;
  readonly dataDirectory: string;
  readonly now: () => Date;
  readonly clientWithdrawn: (clientId: string) => void;
  readonly clientPaused: (clientId: string) => void;
}

export interface Claim {
  readonly code: string;
  readonly name: string;
  readonly platform: ClientRow['platform'];
  readonly remote: string;
}

export class AccessService {
  private readonly attempts = new Map<string, number[]>();

  readonly lifecycle: AccessLifecycle;

  constructor(private readonly options: AccessOptions) {
    this.lifecycle = new AccessLifecycle({
      store: options.store,
      now: options.now,
      clientRemoved: options.clientWithdrawn,
      clientPaused: options.clientPaused,
    });
  }

  get ownerTokenPath(): string {
    return join(this.options.dataDirectory, OWNER_TOKEN_FILE);
  }

  async ensureOwner(): Promise<string> {
    const owner = this.options.store.clients.owner();
    const written = await this.writtenToken();
    if (owner === undefined) {
      const token = createClientToken();
      await this.writeToken(token);
      const created = this.options.store.clients.create(
        {
          name: OWNER_CLIENT_NAME,
          platform: 'desktop',
          role: 'owner',
          tokenHash: hashClientToken(token),
          profileId: this.ownerPerson(),
        },
        true,
      );
      log.info('owner.created', { clientId: created.id, hadWrittenToken: written !== null });
      return token;
    }
    if (
      written !== null &&
      this.options.store.clients.byTokenHash(hashClientToken(written))?.id === owner.id
    ) {
      log.debug('owner.token_confirmed', { clientId: owner.id });
      return written;
    }
    log.warn('owner.token_mismatch', {
      clientId: owner.id,
      reason: written === null ? 'file_missing_or_malformed' : 'hash_not_matching_owner',
    });
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
    this.options.clientWithdrawn(owner.id);
    log.info('owner.token_rotated', { clientId: owner.id });
    return token;
  }

  private ownerPerson(): string {
    return this.options.store.personAccess.homeOwner();
  }

  private standing(profileId: string): KnownStanding {
    const standing = this.options.store.personAccess.standing(profileId);
    if (!standing.known) {
      throw new ApiError('conflict', 'This person’s access cannot be read; check it first.');
    }
    return standing;
  }

  private pairingPerson(
    role: Role,
    createdBy: string,
    profileId: string | undefined,
  ): string | null {
    const store = this.options.store;
    const person = profileId ?? (role === 'owner' ? store.profiles.activeOf(createdBy).id : null);
    if (person === null) return null;
    const access = this.standing(person);
    const creator = store.clients.byId(createdBy);
    if (role === 'owner' && access.role !== 'owner') {
      throw refusal(store, creator, {
        kind: 'refused_scope',
        detail: 'an owner pairing was aimed at a person who is not an owner',
        message: 'An owner device must belong to an owner person.',
      });
    }
    assertMemberPerson(store, creator, role, person);
    if (isExpired(access, this.options.now().toISOString())) {
      throw new ApiError('conflict', 'This person’s access has ended; extend it before pairing.');
    }
    return person;
  }

  startPairing(role: Role, createdBy: string, profileId?: string): Pairing {
    const person = this.pairingPerson(role, createdBy, profileId);
    const metadata = this.connections().metadata();
    const url = this.pairingUrl(metadata);
    const now = this.options.now();
    this.options.store.clients.forgetPairingsBefore(now.toISOString());
    const code = createPairingCode();
    const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS).toISOString();
    this.options.store.clients.addPairing(hashPairingCode(code), {
      role,
      createdBy,
      expiresAt,
      profileId: person ?? undefined,
    });
    this.options.store.accessAudit.record({
      profile_id: person,
      client_id: createdBy,
      kind: 'pairing_started',
      detail: `${role} pairing started`,
    });
    log.info('pairing.started', {
      role,
      createdBy,
      expiresAt,
      endpointKind: metadata.endpoints.find((endpoint) => endpoint.url === url)?.kind ?? 'unknown',
      remoteVerified: this.options.store.settings.read().public_url_verified_at !== null,
      endpoints: metadata.endpoints.map((endpoint) => endpoint.kind),
    });
    return {
      code,
      expiresAt,
      qr: { url, code, identity: metadata.identity, endpoints: metadata.endpoints },
    };
  }

  private connections(): HubConnections {
    if (this.options.connections === undefined)
      throw new ApiError('conflict', 'This hub has no configured connection identity.');
    return this.options.connections;
  }

  private pairingUrl(metadata: HubConnectionMetadata): string {
    const settings = this.options.store.settings.read();
    const publicUrl = settings.public_url_verified_at === null ? null : settings.public_url;
    const lan = metadata.endpoints.find(
      (endpoint) =>
        endpoint.kind === 'lan' &&
        new URL(endpoint.url).hostname !== metadata.identity.tls.serverName,
    );
    const url = publicUrl ?? lan?.url;
    if (url === undefined)
      throw new ApiError(
        'public_url_not_verified',
        'Set and verify Remote access, or enable a secure home-network connection before pairing.',
      );
    return url;
  }

  prove(request: { readonly nonce: string; readonly proof: string; readonly remote: string }): {
    readonly proof: string;
  } {
    this.limit(request.remote);
    const certificate = this.connections().publicIdentity().identity.tls.certificateSha256;
    const hash = this.options.store.clients
      .openPairingHashes()
      .find((open) => pairingProof(open, 'client', certificate, request.nonce) === request.proof);
    if (hash === undefined) {
      log.warn('pairing.proof_rejected', {
        reason: 'no_open_pairing_matches',
        remote: remoteKind(request.remote),
        nonceLength: request.nonce.length,
      });
      throw new ApiError('pairing_code_invalid', INVALID_CODE);
    }
    log.debug('pairing.proof_accepted', () => ({ remote: remoteKind(request.remote) }));
    return { proof: pairingProof(hash, 'hub', certificate, request.nonce) };
  }

  claim(claim: Claim): { token: string; client: ClientRow } {
    this.limit(claim.remote);
    const outcome = this.options.store.clients.claimPairing(hashPairingCode(claim.code));
    if (!outcome.claimed) {
      log.warn('pairing.claim_rejected', {
        reason: outcome.reason,
        remote: remoteKind(claim.remote),
        platform: claim.platform,
        nameLength: claim.name.length,
      });
      throw new ApiError(
        'pairing_code_invalid',
        outcome.reason === 'unknown'
          ? INVALID_CODE
          : `That pairing code is ${outcome.reason}; make a new one on the desktop.`,
      );
    }
    const token = createClientToken();
    this.assertClaimable(outcome.role, outcome.profileId);
    const client = this.options.store.write(() =>
      this.options.store.clients.create({
        name: claim.name,
        platform: claim.platform,
        role: outcome.role,
        tokenHash: hashClientToken(token),
        profileId: this.personOfClaim(outcome.role, outcome.profileId, claim.name),
      }),
    );
    log.info('pairing.claimed', {
      clientId: client.id,
      role: outcome.role,
      platform: claim.platform,
      remote: remoteKind(claim.remote),
    });
    return { token, client };
  }

  private personOfClaim(role: Role, profileId: string | null, deviceName: string): string {
    if (profileId !== null) return profileId;
    return role === 'owner'
      ? this.ownerPerson()
      : this.options.store.profiles.create({
          name: deviceName.slice(0, PROFILE_NAME_MAX).trim(),
        }).id;
  }

  private assertClaimable(role: Role, profileId: string | null): void {
    if (profileId === null) return;
    const access = this.standing(profileId);
    if (role === 'member' && access.role === 'owner') {
      throw this.claimRefused(
        profileId,
        'a member code met an owner person',
        'That person became an owner; make a new pairing code.',
      );
    }
    if (role === 'owner' && access.role !== 'owner') {
      throw this.claimRefused(
        profileId,
        'an owner code met a person who is not an owner',
        'That person is no longer an owner; make a new pairing code.',
      );
    }
    if (isExpired(access, this.options.now().toISOString())) {
      throw this.claimRefused(
        profileId,
        'a code met a person whose access has ended',
        'That person’s access has ended; make a new pairing code.',
      );
    }
  }

  private claimRefused(profileId: string, detail: string, message: string): ApiError {
    this.options.store.accessAudit.record({
      profile_id: profileId,
      client_id: null,
      kind: 'refused_scope',
      detail: `pairing claim refused: ${detail}`,
    });
    return new ApiError('conflict', message);
  }

  private limit(remote: string): void {
    const now = this.options.now().getTime();
    const recent = (this.attempts.get(remote) ?? []).filter((at) => now - at < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIMS_PER_WINDOW) {
      log.warn('pairing.rate_limited', {
        remote: remoteKind(remote),
        attempts: recent.length,
        windowMs: CLAIM_WINDOW_MS,
      });
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
