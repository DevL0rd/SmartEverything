import { AIBI_HOST } from './host-name';

export type Json = Readonly<Record<string, unknown>>;

export interface PatchedFirmware {
  readonly file: string;
  readonly name: string;
  readonly urlPath: string;
  readonly versionNum: string;
  readonly versionName: string;
  readonly responseTag: string;
  readonly md5: string;
  readonly bytes: Buffer;
}

export const BLOCKED_PREFIX = '/ota-blocked/';

const OLDER_VERSION_NUM = '8';
const OLDER_VERSION_NAME = '1.5.0';

const OFFER_PATH = '/aibi/ota/version';

const FIRMWARE_LIKE = /(?:ota|firmware|fw|update|\.bin|\.zip|\.img|\.ota)(?:[/?#]|$)/i;

const ABSOLUTE_LINK = /^https?:\/\//i;

const NO_SPACE = /^\S+$/;

const FILE_NAME = /\.[a-z0-9]{2,4}(?:[?#]|$)/i;

const FIRMWARE_KEYS: ReadonlySet<string> = new Set(['firmware', 'url']);

type LinkKind = 'absolute' | 'relative';

function linkKind(value: string, named: boolean): LinkKind | null {
  if (ABSOLUTE_LINK.test(value)) {
    return named || FIRMWARE_LIKE.test(value) ? 'absolute' : null;
  }
  if (!NO_SPACE.test(value)) {
    return null;
  }
  const shaped = FIRMWARE_LIKE.test(value) && (value.includes('/') || FILE_NAME.test(value));
  return named || shaped ? 'relative' : null;
}

export function isOfferPath(path: string): boolean {
  return path === OFFER_PATH;
}

export function olderVersionRequest(startLine: string): string | null {
  const [method, target = '', protocol = 'HTTP/1.1'] = startLine.split(' ');
  if (method !== 'GET' || !target.startsWith(OFFER_PATH)) {
    return null;
  }
  const url = new URL(`http://local${target}`);
  url.searchParams.set('version_num', OLDER_VERSION_NUM);
  url.searchParams.set('current_name', OLDER_VERSION_NAME);
  return `${method} ${url.pathname}?${url.searchParams.toString()} ${protocol}`;
}

function hostOf(entries: readonly (readonly [string, unknown])[]): string | null {
  const host = entries.find(([key]) => key === 'host')?.[1];
  return typeof host === 'string' && host !== '' ? host : null;
}

function joined(host: string, path: string): string {
  return `http://${host}${path.startsWith('/') ? '' : '/'}${path}`;
}

function linkOf(entry: readonly [string, unknown]): { kind: LinkKind; text: string } | null {
  const [key, item] = entry;
  const kind = typeof item === 'string' ? linkKind(item, FIRMWARE_KEYS.has(key)) : null;
  return typeof item === 'string' && kind !== null ? { kind, text: item } : null;
}

function collect(entries: readonly (readonly [string, unknown])[], found: Set<string>): void {
  const host = hostOf(entries);
  for (const entry of entries) {
    const link = linkOf(entry);
    if (link?.kind === 'absolute') {
      found.add(link.text);
    } else if (link?.kind === 'relative' && host !== null) {
      found.add(joined(host, link.text));
    } else {
      firmwareUrls(entry[1], found);
    }
  }
}

export function firmwareUrls(value: unknown, found = new Set<string>()): string[] {
  if (typeof value === 'string' && linkKind(value, false) === 'absolute') {
    found.add(value);
  }
  if (typeof value === 'object' && value !== null) {
    collect(Object.entries(value), found);
  }
  return [...found];
}

function blockedPath(link: string): string {
  return `${BLOCKED_PREFIX}${Buffer.from(link).toString('base64url')}`;
}

function rewritten(link: { kind: LinkKind; text: string }): string {
  return link.kind === 'absolute'
    ? `http://${AIBI_HOST}${blockedPath(link.text)}`
    : blockedPath(link.text);
}

function rewriteUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    const link = linkOf(['', value]);
    return link === null ? value : rewritten(link);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => rewriteUrls(item));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    const toUs = entries.some(([key, item]) => linkOf([key, item])?.kind === 'relative');
    return Object.fromEntries(
      entries.map(([key, item]) => {
        const link = linkOf([key, item]);
        if (link !== null) {
          return [key, rewritten(link)];
        }
        return [
          key,
          toUs && key === 'host' && typeof item === 'string' ? AIBI_HOST : rewriteUrls(item),
        ];
      }),
    );
  }
  return value;
}

function recordOf(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

export function blockOffer(json: Json): Json {
  return recordOf(rewriteUrls(json)) ?? json;
}

export function patchedOffer(firmware: PatchedFirmware): Json {
  return {
    'version-num': firmware.versionNum,
    'version-name': firmware.versionName,
    updates: { host: AIBI_HOST, firmware: firmware.urlPath, md5: firmware.md5 },
    responsetag: firmware.responseTag,
  };
}
