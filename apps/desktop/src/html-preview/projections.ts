import { createHash, randomBytes } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import type { Session, WebContents } from 'electron';
import {
  BrowserPolicyError,
  NATIVE_PAGE_OPEN,
  NATIVE_HTML_SCHEME,
  encodedPagePath,
  type NativeHtmlProjection,
  type BrowserTarget,
} from '@smarteverything/domain';
import { projectAsset } from './project-assets.js';
import type { NativeHtmlPage, NativeHtmlTransportPort } from './page.js';
import { DesktopServerRelay } from './server-relay.js';

const log = new Logger('desktop.html-preview');
interface Projection extends NativeHtmlPage {
  readonly id: string;
  readonly alias: string;
  readonly url: string;
  readonly controller: AbortController;
  readonly contents: Set<WebContents>;
}
interface Alias extends NativeHtmlPage {
  readonly controller: AbortController;
  readonly projections: Set<string>;
  readonly relay: DesktopServerRelay | undefined;
  readonly ready: Promise<void>;
}
export class DesktopHtmlPreviews {
  private readonly aliases = new Map<string, Alias>();
  private readonly projections = new Map<string, Projection>();
  private readonly sessions = new Set<Session>();
  constructor(private readonly port: NativeHtmlTransportPort) {}
  async open(owner: number, value: unknown): Promise<NativeHtmlProjection> {
    const input = NATIVE_PAGE_OPEN.parse(value);
    if (input.binding.scopeId !== input.scopeId || input.binding.credentialKind !== 'client')
      throw new BrowserPolicyError('HTML pages require their independently paired client.');
    this.port.authorize(input.scopeId, input.authorization, owner);
    const server = 'server' in input.page ? [input.page.server] : [];
    const name = createHash('sha256')
      .update(JSON.stringify([input.binding.canonicalOrigin, input.page.chatId, ...server]))
      .digest('hex');
    const id = randomBytes(32).toString('hex');
    if (this.projections.size >= 16) throw new BrowserPolicyError('Close another chat page first.');
    const alias = this.retainAlias(name, input, owner, id);
    try {
      await alias.ready;
      alias.signal.throwIfAborted();
    } catch (cause) {
      alias.projections.delete(id);
      throw cause;
    }
    const url =
      alias.relay === undefined
        ? `${NATIVE_HTML_SCHEME}://${name}${encodedPagePath(input.page.path)}`
        : `${alias.relay.origin}${input.page.path}`;
    const controller = new AbortController();
    this.projections.set(id, {
      owner,
      id,
      alias: name,
      url,
      input,
      controller,
      signal: controller.signal,
      contents: new Set(),
    });
    return { id, url };
  }
  private retainAlias(
    name: string,
    input: NativeHtmlPage['input'],
    owner: number,
    id: string,
  ): Alias {
    const previous = this.aliases.get(name);
    if (previous !== undefined) {
      if (
        previous.owner !== owner ||
        previous.input.authorization !== input.authorization ||
        JSON.stringify(previous.input.binding) !== JSON.stringify(input.binding)
      )
        throw new BrowserPolicyError('HTML page origin belongs to another enrolled owner.');
      previous.projections.add(id);
      return previous;
    }
    const controller = new AbortController();
    const page = { owner, input, signal: controller.signal };
    const relay =
      'server' in input.page
        ? new DesktopServerRelay(this.port, page, input.page.server)
        : undefined;
    const alias: Alias = {
      ...page,
      controller,
      projections: new Set([id]),
      relay,
      ready: relay === undefined ? Promise.resolve() : relay.start(),
    };
    this.aliases.set(name, alias);
    alias.ready.catch((cause: unknown) => {
      log.error('preview.server_listener_failed', cause);
      if (this.aliases.get(name) === alias) this.aliases.delete(name);
      controller.abort();
    });
    return alias;
  }
  attach(
    owner: number,
    target: Extract<BrowserTarget, { kind: 'project' }>,
    isolated: Session,
    contents: WebContents,
  ): Promise<void> {
    const entry = this.require(owner, target.projectionId);
    if (
      entry.url !== target.url ||
      JSON.stringify(target.page) !== JSON.stringify(entry.input.page)
    )
      throw new BrowserPolicyError('HTML target differs from its native page.');
    const alias = this.aliases.get(entry.alias);
    if (alias === undefined) throw new BrowserPolicyError('HTML page is closed.');
    if (alias.relay === undefined) this.configureSession(isolated, entry.input.page.chatId);
    entry.contents.add(contents);
    contents.once('destroyed', () => {
      entry.contents.delete(contents);
      if (entry.contents.size === 0) this.release(owner, entry.id);
    });
    if (alias.relay === undefined) return Promise.resolve();
    const gate = alias.relay.gate;
    return isolated.cookies.set({
      url: gate.origin,
      name: gate.name,
      value: gate.value,
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
    });
  }
  private configureSession(isolated: Session, chatId: string): void {
    if (this.sessions.has(isolated)) return;
    isolated.protocol.handle(NATIVE_HTML_SCHEME, (request) => {
      const url = new URL(request.url);
      const entry = [...this.projections.values()].find(
        (candidate) =>
          candidate.alias === url.hostname &&
          candidate.input.page.chatId === chatId &&
          candidate.contents.size > 0,
      );
      if (
        entry === undefined ||
        entry.signal.aborted ||
        entry.input.page.chatId !== chatId ||
        url.protocol !== `${NATIVE_HTML_SCHEME}:` ||
        url.port !== '' ||
        url.username !== '' ||
        url.password !== '' ||
        !['GET', 'HEAD'].includes(request.method)
      )
        return new Response(null, { status: 403 });
      const alias = this.aliases.get(entry.alias);
      if (alias === undefined) return new Response(null, { status: 403 });
      return projectAsset(this.port, alias, request);
    });
    this.sessions.add(isolated);
  }
  private require(owner: number, id: string): Projection {
    const entry = this.projections.get(id);
    if (entry?.owner !== owner || entry.signal.aborted)
      throw new BrowserPolicyError('HTML page is closed or belongs to another window.');
    this.port.authorize(entry.input.scopeId, entry.input.authorization, owner);
    return entry;
  }
  release(owner: number, id: string): void {
    const entry = this.projections.get(id);
    if (entry === undefined) return;
    if (entry.owner !== owner) throw new BrowserPolicyError('HTML page belongs to another window.');
    this.projections.delete(id);
    entry.controller.abort();
    const alias = this.aliases.get(entry.alias);
    if (alias !== undefined) {
      alias.projections.delete(id);
      if (alias.projections.size === 0) {
        this.aliases.delete(entry.alias);
        alias.controller.abort();
      }
    }
    for (const contents of entry.contents) if (!contents.isDestroyed()) contents.close();
  }
  closeOwner(owner: number): void {
    for (const entry of [...this.projections.values()])
      if (entry.owner === owner) this.release(owner, entry.id);
  }
  close(): void {
    for (const entry of [...this.projections.values()]) this.release(entry.owner, entry.id);
    for (const alias of this.aliases.values()) alias.controller.abort();
    this.aliases.clear();
    for (const isolated of this.sessions) isolated.protocol.unhandle(NATIVE_HTML_SCHEME);
    this.sessions.clear();
  }
}
let projections: DesktopHtmlPreviews | null = null;
export function configureDesktopHtml(port: NativeHtmlTransportPort): () => void {
  if (projections !== null) throw new BrowserPolicyError('HTML transport is already configured.');
  const owned = new DesktopHtmlPreviews(port);
  projections = owned;
  return (): void => {
    owned.close();
    if (projections === owned) projections = null;
  };
}
export function desktopHtml(): DesktopHtmlPreviews | null {
  return projections;
}
