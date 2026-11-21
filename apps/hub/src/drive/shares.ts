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
  type DriveAlbum,
  type DriveItem,
  type DriveShare,
  type DriveShareCreate,
  type DriveShareCreated,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { linkExpiry } from '../server/media-links';
import type { DriveItemWindow } from '../store/repositories/drive-items';
import type { Store } from '../store/store';
import { decodeCursor, encodeCursor } from './search';
import { VIEW_ONLY_REASON } from './sharing/export-guard';
import type { DriveActor } from './access';

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
  readonly store: Pick<Store, 'host'>;
  readonly origin: () => ShareOrigin;
  readonly now: () => Date;
}

export interface ItemShareAccess {
  readonly kind: 'item';
  readonly share: DriveShare;
  readonly passwordHash: string | null;
  readonly entryId: string;
  readonly item: DriveItem;
}

export interface AlbumShareAccess {
  readonly kind: 'album';
  readonly share: DriveShare;
  readonly passwordHash: string | null;
  readonly entryId: string;
  readonly album: DriveAlbum;
}

export type ShareAccess = ItemShareAccess | AlbumShareAccess;

export interface AlbumShareWindow {
  readonly items: readonly DriveItem[];
  readonly next: string | null;
}

const ALBUM_AFTER = z.strictObject({ position: z.number(), itemId: z.string().min(1) });

export interface ShareLink {
  readonly url: string;
  readonly expiresAt: string;
}

export function shareOriginOf(store: Pick<Store, 'live'>, local: string): ShareOrigin {
  const publicUrl = store.live.home.settings.read().public_url;
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
    const recent = this.recent(key);
    const freeing = recent[recent.length - GUESS_LIMIT];
    if (freeing === undefined) return;
    const seconds = Math.max(
      1,
      Math.ceil((freeing + GUESS_WINDOW_MS - this.now().getTime()) / 1000),
    );
    throw new ApiError(
      'rate_limited',
      `Too many wrong attempts. Try again in ${String(Math.ceil(seconds / 60))} min.`,
      null,
      seconds,
    );
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
    const { target, linksAllowed } = await this.env.store.host.read('driveShareTarget', {
      actor,
      create: input,
    });
    if (!linksAllowed) {
      throw new ApiError('forbidden', 'The owner has not allowed members to share links.');
    }
    if (target.kind === 'item' && target.item.locked && input.permission === 'download') {
      throw new ApiError(
        'invalid_request',
        'This is view only, so its links can only be view links.',
        VIEW_ONLY_REASON,
      );
    }
    if (input.expiresAt !== null && new Date(input.expiresAt) <= this.env.now()) {
      throw new ApiError('invalid_request', 'The expiry must be in the future.');
    }
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const share = await this.env.store.host.call('driveShares', 'insert', {
      id: randomUUID(),
      ...(target.kind === 'item'
        ? { itemId: target.item.id }
        : { itemId: null, albumId: target.album.id }),
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
      itemId: share.itemId,
      albumId: share.albumId,
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

  linksAllowed(actor: ShareActor): Promise<boolean> {
    return this.env.store.host.read('driveShareLinksAllowed', actor);
  }

  list(actor: DriveActor, itemId: string): Promise<DriveShare[]> {
    return this.env.store.host.read('driveSharesOfItem', { actor, itemId });
  }

  async revoke(actor: DriveActor, shareId: string): Promise<DriveShare> {
    const revoked = await this.env.store.host.write('driveShareRevoke', {
      actor,
      shareId,
      at: this.env.now().toISOString(),
    });
    log.info('drive_share.revoked', { shareId: revoked.id, by: actor.profileId });
    return revoked;
  }

  async open(token: string): Promise<ShareAccess> {
    const parsed = TOKEN.safeParse(token);
    if (!parsed.success) throw unavailable();
    const opened = await this.env.store.host.read('driveShareOpen', {
      tokenHash: hashToken(parsed.data),
    });
    if (opened.kind === 'unavailable' || this.lapsed(opened.share)) throw unavailable();
    const { share, passwordHash } = opened;
    return opened.kind === 'album'
      ? { kind: 'album', share, passwordHash, entryId: opened.album.id, album: opened.album }
      : { kind: 'item', share, passwordHash, entryId: opened.item.id, item: opened.item };
  }

  private lapsed(share: DriveShare): boolean {
    const expired = share.expiresAt !== null && new Date(share.expiresAt) <= this.env.now();
    return share.revokedAt !== null || expired;
  }

  async within(access: ShareAccess, itemId: string): Promise<DriveItem> {
    if (access.kind === 'item' && itemId === access.item.id) return access.item;
    const found = await this.env.store.host.read('driveShareWithin', {
      entry:
        access.kind === 'album'
          ? { kind: 'album', albumId: access.album.id }
          : { kind: 'item', item: access.item },
      itemId,
    });
    if (found === null) throw unavailable();
    return found;
  }

  async rootPathOf(item: DriveItem): Promise<string> {
    const path = await this.env.store.host.read('driveShareRootPath', { rootId: item.rootId });
    if (path === null) throw unavailable();
    return path;
  }

  async albumItems(
    album: DriveAlbum,
    after: string | null,
    limit: number,
  ): Promise<AlbumShareWindow> {
    const cursor = after === null ? null : decodeCursor(ALBUM_AFTER, after);
    const window = await this.env.store.host.read('driveShareAlbumItems', {
      albumId: album.id,
      after: cursor,
      limit,
    });
    return { items: window.items, next: window.next === null ? null : encodeCursor(window.next) };
  }

  children(folder: DriveItem, after: string | null, limit: number): Promise<DriveItemWindow> {
    return this.env.store.host.read('driveShareChildren', {
      rootId: folder.rootId,
      parentId: folder.id,
      after,
      limit,
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

  async record(access: ShareAccess, kind: 'open' | 'download'): Promise<void> {
    await this.env.store.host.call(
      'driveShares',
      'recordEvent',
      access.share.id,
      kind,
      this.env.now().toISOString(),
    );
  }

  link(access: ShareAccess, token: string, itemId: string): ShareLink {
    const expires = linkExpiry(this.env.now());
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

  private sign(shareId: string, itemId: string, expires: number): string {
    return createHmac('sha256', this.key)
      .update([shareId, itemId, String(expires)].join('\n'))
      .digest('hex');
  }
}
