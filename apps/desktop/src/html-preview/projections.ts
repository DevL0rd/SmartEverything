import { projectAsset } from './project-assets.js';
import { randomBytes } from 'node:crypto';
import type { Session, WebContents } from 'electron';
import {
  BrowserPolicyError,
  NATIVE_HTML_CSP,
  NATIVE_HTML_OPEN,
  NATIVE_HTML_SCHEME,
  type NativeHtmlProjection,
  type BrowserTarget,
} from '@smarteverything/domain';
import { claimNativeHtml, type ClaimedHtml, type NativeHtmlClaimPort } from './claim.js';

interface Projection {
  readonly owner: number;
  readonly id: string;
  readonly url: string;
  readonly claim: ClaimedHtml;
  readonly timer: NodeJS.Timeout | null;
}
export class DesktopHtmlPreviews {
  private readonly projections = new Map<string, Projection>();
  private pending = 0;
  constructor(private readonly port: NativeHtmlClaimPort) {}
  async open(owner: number, value: unknown): Promise<NativeHtmlProjection> {
    if (this.projections.size + this.pending >= 16)
      throw new BrowserPolicyError('Close another HTML preview first.');
    this.pending += 1;
    let claim: ClaimedHtml;
    try {
      claim = await claimNativeHtml(this.port, NATIVE_HTML_OPEN.parse(value), owner);
    } finally {
      this.pending -= 1;
    }
    if (claim.signal.aborted) throw new BrowserPolicyError('HTML claim was already retired.');
    const id = randomBytes(32).toString('hex');
    const project = !('html' in claim.document);
    const path = 'html' in claim.document ? '/' : claim.document.entryPath;
    const url = `${NATIVE_HTML_SCHEME}://${id}${path}`;
    const remaining =
      claim.document.expiresAt === null ? null : Date.parse(claim.document.expiresAt) - Date.now();
    if (remaining !== null && remaining <= 0) {
      claim.close();
      throw new BrowserPolicyError('HTML claim expired.');
    }
    const timer =
      remaining === null
        ? null
        : setTimeout(() => {
            this.release(owner, id);
          }, remaining);
    timer?.unref();
    this.projections.set(id, { owner, id, url, claim, timer });
    claim.signal.addEventListener(
      'abort',
      () => {
        this.release(owner, id);
      },
      { once: true },
    );
    return {
      id,
      url,
      expiresAt: claim.document.expiresAt,
      ...(project ? { project: true as const } : {}),
    };
  }
  attach(
    owner: number,
    target: Extract<BrowserTarget, { kind: 'native-html' }>,
    isolated: Session,
    contents: WebContents,
  ): void {
    const entry = this.require(owner, target.projectionId);
    if (
      entry.url !== target.url ||
      target.project !== ('html' in entry.claim.document ? undefined : true)
    )
      throw new BrowserPolicyError('HTML target differs from its native projection.');
    isolated.protocol.handle(NATIVE_HTML_SCHEME, (request) => {
      if (
        !this.allows(entry, request.url) ||
        !['GET', 'HEAD'].includes(request.method) ||
        entry.claim.signal.aborted
      )
        return new Response(null, { status: 403 });
      if (!('html' in entry.claim.document))
        return projectAsset(this.port, entry.claim, entry.claim.document, request);
      const html = entry.claim.document.html;
      return new Response(request.method === 'HEAD' ? null : html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(Buffer.byteLength(html)),
          'content-security-policy': NATIVE_HTML_CSP,
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        },
      });
    });
    const close = (): void => {
      if (!contents.isDestroyed()) contents.close();
    };
    entry.claim.signal.addEventListener('abort', close, { once: true });
    contents.once('destroyed', () => {
      entry.claim.signal.removeEventListener('abort', close);
      isolated.protocol.unhandle(NATIVE_HTML_SCHEME);
      this.release(owner, entry.id);
    });
  }
  private allows(entry: Projection, value: string): boolean {
    if ('html' in entry.claim.document) return value === entry.url;
    const url = new URL(value);
    return (
      url.protocol === `${NATIVE_HTML_SCHEME}:` &&
      url.hostname === entry.id &&
      url.port === '' &&
      url.username === '' &&
      url.password === ''
    );
  }
  private require(owner: number, id: string): Projection {
    const entry = this.projections.get(id);
    if (entry?.owner !== owner || entry.claim.signal.aborted)
      throw new BrowserPolicyError('HTML projection is retired or belongs to another window.');
    return entry;
  }
  release(owner: number, id: string): void {
    const entry = this.projections.get(id);
    if (entry === undefined) return;
    if (entry.owner !== owner)
      throw new BrowserPolicyError('HTML projection belongs to another window.');
    this.projections.delete(id);
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.claim.close();
  }
  closeOwner(owner: number): void {
    for (const entry of [...this.projections.values()])
      if (entry.owner === owner) this.release(owner, entry.id);
  }
  close(): void {
    for (const entry of [...this.projections.values()]) this.release(entry.owner, entry.id);
  }
}
let projections: DesktopHtmlPreviews | null = null;
export function configureDesktopHtml(port: NativeHtmlClaimPort): () => void {
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
