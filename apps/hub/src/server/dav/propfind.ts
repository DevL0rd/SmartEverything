import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DriveItem } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { DRIVE_PAGE_SIZE } from '../../drive/service-read';
import { authenticateDav, DavError, guarded, type DavDeps, type DavExchange } from './dav-auth';
import { DAV_PREFIX, headerOf, targetOf, type DavTarget } from './collections';

const DAV_NAMESPACE = 'DAV:';

interface PropertyName {
  readonly ns: string;
  readonly name: string;
}

type Selection =
  | { readonly kind: 'all' }
  | { readonly kind: 'names' }
  | { readonly kind: 'props'; readonly names: readonly PropertyName[] };

interface Tag extends PropertyName {
  readonly parent: number;
}

interface Resource {
  readonly href: string;
  readonly collection: boolean;
  readonly displayName: string;
  readonly modified: string | null;
  readonly created: string | null;
  readonly bytes: number | null;
  readonly mime: string | null;
  readonly etag: string | null;
}

type Value = (resource: Resource) => string | null;

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function utc(moment: string | null): string | null {
  return moment === null ? null : new Date(moment).toUTCString();
}

const LIVE_VALUES: Readonly<Record<string, Value>> = {
  displayname: (resource) => escapeXml(resource.displayName),
  resourcetype: (resource) => (resource.collection ? '<D:collection/>' : ''),
  getcontentlength: (resource) => resource.bytes?.toString() ?? null,
  getcontenttype: (resource) => (resource.mime === null ? null : escapeXml(resource.mime)),
  getlastmodified: (resource) => utc(resource.modified),
  creationdate: (resource) => resource.created,
  getetag: (resource) =>
    resource.etag === null ? null : `&quot;${escapeXml(resource.etag)}&quot;`,
};

const LIVE: ReadonlyMap<string, Value> = new Map(Object.entries(LIVE_VALUES));

const TAG = /<(\/?)(?:([A-Za-z_][\w.-]*):)?([A-Za-z_][\w.-]*)((?:\s[^<>]*?)?)(\/?)>/gu;
const NAMESPACE_DECLARATION = /xmlns(?::([\w.-]+))?\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

function declared(scope: ReadonlyMap<string, string>, attributes: string): Map<string, string> {
  const next = new Map(scope);
  for (const match of attributes.matchAll(NAMESPACE_DECLARATION)) {
    next.set(match[1] ?? '', match[2] ?? match[3] ?? '');
  }
  return next;
}

interface Open {
  readonly qualified: string;
  readonly index: number;
  readonly scope: ReadonlyMap<string, string>;
}

function malformed(): DavError {
  return new DavError(400, 'The request body is not well-formed XML.');
}

interface Scan {
  readonly tags: Tag[];
  readonly open: Open[];
}

interface Token {
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly prefix: string | undefined;
  readonly name: string;
  readonly attributes: string;
  readonly qualified: string;
}

function tokenOf(match: RegExpExecArray): Token {
  const [, closing, prefix, name = '', attributes = '', selfClosing] = match;
  return {
    closing: closing === '/',
    selfClosing: selfClosing === '/',
    prefix,
    name,
    attributes,
    qualified: prefix === undefined ? name : `${prefix}:${name}`,
  };
}

function startTag(scan: Scan, token: Token): void {
  const enclosing = scan.open.at(-1);
  const scope = declared(enclosing?.scope ?? new Map(), token.attributes);
  scan.tags.push({
    ns: scope.get(token.prefix ?? '') ?? '',
    name: token.name,
    parent: enclosing?.index ?? -1,
  });
  if (!token.selfClosing) {
    scan.open.push({ qualified: token.qualified, index: scan.tags.length - 1, scope });
  }
}

function tagsOf(xml: string): readonly Tag[] {
  const scan: Scan = { tags: [], open: [] };
  for (const match of xml.matchAll(TAG)) {
    const token = tokenOf(match);
    if (!token.closing) {
      startTag(scan, token);
    } else if (scan.open.pop()?.qualified !== token.qualified) {
      throw malformed();
    }
  }
  if (scan.open.length > 0) throw malformed();
  return scan.tags;
}

function isDav(tag: PropertyName | undefined, name: string): boolean {
  return tag?.ns === DAV_NAMESPACE && tag.name === name;
}

function selectionOf(xml: string): Selection {
  if (xml.trim() === '') return { kind: 'all' };
  const tags = tagsOf(xml);
  if (!isDav(tags[0], 'propfind')) throw malformed();
  const requested = tags.flatMap((tag, index) => (tag.parent === 0 ? [{ tag, index }] : []));
  if (requested.some(({ tag }) => isDav(tag, 'propname'))) return { kind: 'names' };
  const list = requested.find(({ tag }) => isDav(tag, 'prop'));
  if (list === undefined) return { kind: 'all' };
  return {
    kind: 'props',
    names: tags.filter((tag) => tag.parent === list.index).map(({ ns, name }) => ({ ns, name })),
  };
}

async function bodyOf(request: IncomingMessage): Promise<string> {
  const source: AsyncIterable<Uint8Array> = request;
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function depthOf(request: IncomingMessage): 0 | 1 {
  const depth = headerOf(request, 'depth');
  if (depth === '0') return 0;
  if (depth === '1') return 1;
  throw new DavError(403, 'Only Depth 0 and Depth 1 are served.', 'propfind-finite-depth');
}

export function hrefOf(rootId: string, relPath: string, collection: boolean): string {
  const base = `${DAV_PREFIX}${encodeURIComponent(rootId)}/`;
  if (relPath === '') return base;
  const path = relPath.split('/').map(encodeURIComponent).join('/');
  return collection ? `${base}${path}/` : `${base}${path}`;
}

function rootResource(root: StoredDrive): Resource {
  return {
    href: hrefOf(root.id, '', true),
    collection: true,
    displayName: root.scope === 'home' ? 'Shared Drive' : 'My Drive',
    modified: root.scannedAt,
    created: null,
    bytes: null,
    mime: null,
    etag: null,
  };
}

function itemResource(item: DriveItem): Resource {
  const collection = item.kind === 'folder';
  return {
    href: hrefOf(item.rootId, item.relPath, collection),
    collection,
    displayName: item.name,
    modified: item.modifiedAt,
    created: item.addedAt,
    bytes: collection ? null : item.bytes,
    mime: item.kind === 'folder' ? null : item.mime,
    etag: item.etag,
  };
}

function unknownProperty(property: PropertyName): string {
  return property.ns === DAV_NAMESPACE
    ? `<D:${property.name}/>`
    : `<n0:${property.name} xmlns:n0="${escapeXml(property.ns)}"/>`;
}

function propstat(properties: readonly string[], status: string): string {
  return properties.length === 0
    ? ''
    : `<D:propstat><D:prop>${properties.join('')}</D:prop><D:status>HTTP/1.1 ${status}</D:status></D:propstat>`;
}

function render(name: string, value: string, names: boolean): string {
  return names || value === '' ? `<D:${name}/>` : `<D:${name}>${value}</D:${name}>`;
}

function describe(resource: Resource, selection: Selection): string {
  const found: string[] = [];
  const missing: string[] = [];
  const wanted: readonly PropertyName[] =
    selection.kind === 'props'
      ? selection.names
      : [...LIVE.keys()].map((name) => ({ ns: DAV_NAMESPACE, name }));
  for (const property of wanted) {
    const value = property.ns === DAV_NAMESPACE ? LIVE.get(property.name)?.(resource) : undefined;
    if (value !== undefined && value !== null) {
      found.push(render(property.name, value, selection.kind === 'names'));
    } else if (selection.kind === 'props') {
      missing.push(unknownProperty(property));
    }
  }
  const href = escapeXml(resource.href);
  return `<D:response><D:href>${href}</D:href>${propstat(found, '200 OK')}${propstat(missing, '404 Not Found')}</D:response>`;
}

function* multistatus(
  deps: DavDeps,
  target: DavTarget,
  view: { readonly selection: Selection; readonly depth: 0 | 1; readonly viewer: string },
): Generator<string> {
  const { selection, depth, viewer } = view;
  yield '<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">';
  const parent = target.item;
  yield describe(
    parent === undefined ? rootResource(target.root) : itemResource(parent),
    selection,
  );
  if (depth === 1 && (parent === undefined || parent.kind === 'folder')) {
    let after: string | null = null;
    do {
      const window = deps.store.driveItems.children({
        rootId: target.root.id,
        parentId: parent?.id ?? null,
        after,
        limit: DRIVE_PAGE_SIZE,
        viewer,
      });
      for (const { item } of window.entries) yield describe(itemResource(item), selection);
      after = window.next;
    } while (after !== null);
  }
  yield '</D:multistatus>';
}

export function handlePropfind(deps: DavDeps, exchange: DavExchange): Promise<void> {
  const { request, response } = exchange;
  return guarded(exchange, async () => {
    const caller = authenticateDav(deps, request);
    const target = targetOf(deps, caller, request);
    const depth = depthOf(request);
    const selection = selectionOf(await bodyOf(request));
    if (target.relPath !== '' && target.item === undefined) {
      throw new DavError(404, 'There is nothing at that address.');
    }
    response.writeHead(207, {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'no-store',
    });
    await pipeline(
      Readable.from(
        multistatus(deps, target, { selection, depth, viewer: caller.actor.profileId }),
      ),
      response,
    );
  });
}
