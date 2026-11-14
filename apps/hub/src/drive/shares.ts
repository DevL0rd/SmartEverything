import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import {
  ApiError,
  DRIVE_SHARE_CREATED,
  MEDIA_PATHS,
  buildPath,
  type DriveItem,
  type DriveShare,
  type DriveShareCreate,
  type DriveShareCreated,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { LINK_LIFETIME_SECONDS } from '../server/media-links';
import type { DriveItemWindow } from '../store/repositories/drive-items';
import type { Store } from '../store/store';
import { readDriveSettings } from './settings';
import { canRead, canShare, itemAccess, type DriveActor, type ItemAccess } from './access';

const log = new Logger('hub.drive');

function deriveKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (failure, key) => {
      if (failure === null) resolve(key);
      else reject(failure);
    });
  });
}

const TOKEN_BYTES = 32;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
export const GUESS_WINDOW_MS = 10 * 60_000;
export const GUESS_LIMIT = 5;

const TOKEN = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
const SIGNED_QUERY = z.object({
  expires: z.coerce.number().int().positive(),
  signature: z.string().regex(/^[0-9a-f]{64}$/u),
});

export interface ShareOrigin {
  readonly url: string;
  readonly public: boolean;
}

export interface ShareActor extends DriveActor {
  readonly owner: boolean;
}

export interface SharesEnv {
  readonly store: Pick<
    Store,
    'driveShares' | 'driveItems' | 'driveRoots' | 'driveGrants' | 'settingsKv'
  >;
  readonly origin: () => ShareOrigin;
  readonly now: () => Date;
}

export interface ShareAccess {
  readonly share: DriveShare;
  readonly passwordHash: string | null;
  readonly item: DriveItem;
  readonly rootPath: string;
}

export interface ShareLink {
  readonly url: string;
  readonly expiresAt: string;
}

export function shareOriginOf(store: Pick<Store, 'settings'>, local: string): ShareOrigin {
  const publicUrl = store.settings.read().public_url;
  return publicUrl === null ? { url: local, public: false } : { url: publicUrl, public: true };
}

function unavailable(): ApiError {
  return new ApiError('not_found', 'This link is no longer available.');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, KEY_BYTES);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function passwordMatches(stored: string, password: string): Promise<boolean> {
  const [salt = '', key = ''] = stored.split(':');
  const expected = Buffer.from(key, 'hex');
  const derived = await deriveKey(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(expected, derived);
}

export class GuessLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly now: () => Date) {}

  check(key: string): void {
    if (this.recent(key).length >= GUESS_LIMIT) {
      throw new ApiError('rate_limited', 'Too many wrong passwords; try again later.');
    }
  }

  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), this.now().getTime()]);
  }

  private recent(key: string): number[] {
    const at = this.now().getTime();
    const recent = (this.failures.get(key) ?? []).filter((failed) => at - failed < GUESS_WINDOW_MS);
    if (recent.length === 0) this.failures.delete(key);
    else this.failures.set(key, recent);
    return recent;
  }
}

export class DriveShares {
  private readonly key = randomBytes(32);
  private readonly limiter: GuessLimiter;

  constructor(private readonly env: SharesEnv) {
    this.limiter = new GuessLimiter(env.now);
  }

  async create(actor: ShareActor, input: DriveShareCreate): Promise<DriveShareCreated> {
    const item = this.visibleItem(actor, input.itemId);
    if (!canShare(this.accessTo(actor, item))) {
      throw new ApiError('forbidden', 'Only the person whose drive this is can share it.');
    }
    if (!actor.owner && !readDriveSettings(this.env.store).membersMayShare) {
      throw new ApiError('forbidden', 'The owner has not allowed members to share links.');
    }
    if (input.expiresAt !== null && new Date(input.expiresAt) <= this.env.now()) {
      throw new ApiError('invalid_request', 'The expiry must be in the future.');
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const share = this.env.store.driveShares.insert({
      id: randomUUID(),
      itemId: item.id,
      tokenHash: hashToken(token),
      permission: input.permission,
      expiresAt: input.expiresAt,
      passwordHash: input.password === null ? null : await hashPassword(input.password),
      createdBy: actor.profileId,
      createdAt: this.env.now().toISOString(),
    });
    const origin = this.env.origin();
    const path = buildPath(MEDIA_PATHS.driveShare, { token });
    log.info('drive_share.created', {
      shareId: share.id,
      itemId: item.id,
      permission: share.permission,
      password: share.hasPassword,
      public: origin.public,
    });
    return DRIVE_SHARE_CREATED.parse({
      share,
      url: `${origin.url.replace(/\/+$/u, '')}${path}`,
      public: origin.public,
    });
  }

  list(actor: DriveActor, itemId: string): DriveShare[] {
    const item = this.visibleItem(actor, itemId);
    const sharedDrive = this.env.store.driveRoots.byId(item.rootId).scope === 'home';
    return this.env.store.driveShares
      .forItem(itemId)
      .filter((share) => sharedDrive || share.createdBy === actor.profileId);
  }

  revoke(actor: DriveActor, shareId: string): DriveShare {
    const share = this.env.store.driveShares.find(shareId);
    const item =
      share === undefined ? undefined : this.env.store.driveItems.find(share.itemId, null);
    const sharedDrive =
      item !== undefined && this.env.store.driveRoots.byId(item.rootId).scope === 'home';
    if (share === undefined || !(sharedDrive || share.createdBy === actor.profileId)) {
      throw new ApiError('not_found', 'There is no such share link for this caller.');
    }
    const revoked = this.env.store.driveShares.revoke(share.id, this.env.now().toISOString());
    log.info('drive_share.revoked', { shareId: share.id, by: actor.profileId });
    return revoked;
  }

  open(token: string): ShareAccess {
    const parsed = TOKEN.safeParse(token);
    const record = parsed.success
      ? this.env.store.driveShares.byTokenHash(hashToken(parsed.data))
      : undefined;
    if (record === undefined) throw unavailable();
    const { share } = record;
    const item = this.env.store.driveItems.find(share.itemId, null);
    const root = item === undefined ? undefined : this.env.store.driveRoots.find(item.rootId);
    if (this.lapsed(share) || item === undefined || root === undefined) {
      throw unavailable();
    }
    return { share, passwordHash: record.passwordHash, item, rootPath: root.path };
  }

  private lapsed(share: DriveShare): boolean {
    const expired = share.expiresAt !== null && new Date(share.expiresAt) <= this.env.now();
    return share.revokedAt !== null || expired;
  }

  within(access: ShareAccess, itemId: string): DriveItem {
    if (itemId === access.item.id) return access.item;
    const child = this.env.store.driveItems.find(itemId, null);
    const inside =
      child !== undefined &&
      access.item.kind === 'folder' &&
      child.rootId === access.item.rootId &&
      child.relPath.startsWith(`${access.item.relPath}/`);
    if (!inside) throw unavailable();
    return child;
  }

  children(folder: DriveItem, after: string | null, limit: number): DriveItemWindow {
    return this.env.store.driveItems.children({
      rootId: folder.rootId,
      parentId: folder.id,
      after,
      limit,
      viewer: null,
    });
  }

  async verifyPassword(access: ShareAccess, password: string): Promise<void> {
    if (access.passwordHash === null) {
      throw new ApiError('invalid_request', 'This link has no password.');
    }
    const id = access.share.id;
    try {
      this.limiter.check(id);
    } catch (cause) {
      log.warn('drive_share.guess_limited', { shareId: id });
      throw cause;
    }
    if (!(await passwordMatches(access.passwordHash, password))) {
      this.limiter.fail(id);
      log.warn('drive_share.password_failed', { shareId: id });
      throw new ApiError('unauthorized', 'The password is not right.');
    }
  }

  record(access: ShareAccess, kind: 'open' | 'download'): void {
    this.env.store.driveShares.recordEvent(access.share.id, kind, this.env.now().toISOString());
  }

  link(access: ShareAccess, token: string, itemId: string): ShareLink {
    const expires = Math.floor(this.env.now().getTime() / 1000) + LINK_LIFETIME_SECONDS;
    const search = new URLSearchParams({
      expires: String(expires),
      signature: this.sign(access.share.id, itemId, expires),
    });
    const path = buildPath(`${MEDIA_PATHS.driveShare}/:itemId`, { token, itemId });
    return {
      url: `${path}?${search.toString()}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  verifyLink(access: ShareAccess, itemId: string, url: URL): void {
    const parsed = SIGNED_QUERY.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ApiError('unauthorized', 'This link needs its password.');
    }
    const { expires, signature } = parsed.data;
    if (expires * 1000 <= this.env.now().getTime()) {
      throw new ApiError('link_expired', 'This link has expired; enter the password again.');
    }
    const expected = Buffer.from(this.sign(access.share.id, itemId, expires), 'hex');
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
      throw new ApiError('unauthorized', 'This link was not signed for this item.');
    }
  }

  private accessTo(actor: DriveActor, item: DriveItem): ItemAccess {
    return itemAccess(this.env.store, actor, this.env.store.driveRoots.byId(item.rootId), item);
  }

  private visibleItem(actor: DriveActor, itemId: string): DriveItem {
    const item = this.env.store.driveItems.find(itemId, actor.profileId);
    if (item === undefined || !canRead(this.accessTo(actor, item))) {
      throw new ApiError('not_found', 'There is no such file or folder for this caller.');
    }
    return item;
  }

  private sign(shareId: string, itemId: string, expires: number): string {
    return createHmac('sha256', this.key)
      .update([shareId, itemId, String(expires)].join('\n'))
      .digest('hex');
  }
}
