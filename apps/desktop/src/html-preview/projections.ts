import { createHash, randomBytes } from 'node:crypto';
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
}
export class DesktopHtmlPreviews {
  private readonly aliases = new Map<string, Alias>();
  private readonly projections = new Map<string, Projection>();
  private readonly sessions = new Set<Session>();
  constructor(private readonly port: NativeHtmlTransportPort) {}
  open(owner: number, value: unknown): Promise<NativeHtmlProjection> {
    const input = NATIVE_PAGE_OPEN.parse(value);
    if (input.binding.scopeId !== input.scopeId || input.binding.credentialKind !== 'client')
      throw new BrowserPolicyError('HTML pages require their independently paired client.');
    this.port.authorize(input.scopeId, input.authorization, owner);
    const alias = createHash('sha256')
      .update(
        JSON.stringify([input.binding.canonicalOrigin, input.page.chatId]),
      )
      .digest('hex');
    const url = `${NATIVE_HTML_SCHEME}://${alias}${encodedPagePath(input.page.path)}`;
    const id = randomBytes(32).toString('hex');
    if (this.projections.size >= 16)
      throw new BrowserPolicyError('Close another chat page first.');
    this.retainAlias(alias, input, owner, id);
    const controller = new AbortController();
    this.projections.set(id, {
      owner,
      id,
      alias,
      url,
      input,
      controller,
      signal: controller.signal,
      contents: new Set(),
    });
    return Promise.resolve({ id, url });
  }
  private retainAlias(
    alias: string,
    input: NativeHtmlPage['input'],
    owner: number,
    id: string,
  ): void {
    const previous = this.aliases.get(alias);
    if (previous !== undefined) {
      if (
        previous.owner !== owner ||
        previous.input.authorization !== input.authorization ||
        JSON.stringify(previous.input.binding) !== JSON.stringify(input.binding)
      )
        throw new BrowserPolicyError('HTML page origin belongs to another enrolled owner.');
      previous.projections.add(id);
      return;
    }
    const controller = new AbortController();
    this.aliases.set(alias, {
      owner,
      input,
      controller,
      signal: controller.signal,
      projections: new Set([id]),
    });
  }
  attach(
    owner: number,
    target: Extract<BrowserTarget, { kind: 'project' }>,
    isolated: Session,
    contents: WebContents,
  ): void {
    const entry = this.require(owner, target.projectionId);
    if (
      entry.url !== target.url ||
      JSON.stringify(target.page) !== JSON.stringify(entry.input.page)
    )
      throw new BrowserPolicyError('HTML target differs from its native page.');
    this.configureSession(isolated, entry.input.page.chatId);
    entry.contents.add(contents);
    contents.once('destroyed', () => {
      entry.contents.delete(contents);
      if (entry.contents.size === 0) this.release(owner, entry.id);
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
