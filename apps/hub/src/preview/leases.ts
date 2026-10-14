import { setMaxListeners } from 'node:events';
import { randomBytes } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type { AiPreviewLease, AiHtmlPreviewLease, NativeHtmlLease } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import type { Publication } from './publications';
import type { HtmlPublication } from './documents';
import { previewNeedsOwner, type PreviewSource, type PreviewSources } from './sources';
const LEASE_LISTENERS_MAX = 64;
const BOOTSTRAP_MS = 30_000;
const LEGACY_LEASE_MS = 10 * 60_000;
export const PREVIEW_COOKIE = '__Host-se-preview';
interface LeaseScope {
  readonly id: string;
  readonly publication: PreviewSource;
  readonly clientId: string;
  readonly profileId: string;
  readonly expires: number | null;
  readonly bootstrapExpires: number;
  readonly abort: AbortController;
  readonly assetToken: string;
}
export interface ViewerLease extends LeaseScope {
  readonly purpose: 'gateway';
  readonly host: string;
  readonly credential: string;
}
export interface NativeViewerLease extends LeaseScope {
  readonly purpose: 'native-html';
  readonly publication: HtmlPublication;
}
type PreviewLease = ViewerLease | NativeViewerLease;
export class PreviewLeases {
  private readonly claimed = new Set<string>();
  private readonly owners = new Set<string>();
  private readonly hosts = new Map<string, ViewerLease>();
  private readonly entries = new Map<string, PreviewLease>();
  private readonly codes = new Map<string, PreviewLease>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly unsubscribe: readonly (() => void)[];
  constructor(
    private readonly store: Store,
    private readonly publications: Pick<PreviewSources, 'require' | 'onRevoke'>,
  ) {
    this.unsubscribe = [
      store.feed.subscribe(() => {
        this.revalidate();
      }),
      publications.onRevoke((id) => {
        for (const lease of this.entries.values())
          if (lease.publication.view.id === id) this.close(lease);
      }),
    ];
  }
  issue(
    caller: Caller,
    publication: Publication,
    baseDomain: string,
    lifetime?: 'persistent',
  ): AiPreviewLease {
    const { lease, code } = this.allocate(caller, publication, baseDomain, lifetime);
    return {
      ...leaseView(lease, code),
      target: publication.view.target,
      generation: publication.view.generation,
    };
  }
  issueHtml(
    caller: Caller,
    publication: HtmlPublication,
    baseDomain: string,
    lifetime?: 'persistent',
  ): AiHtmlPreviewLease {
    const { lease, code } = this.allocate(caller, publication, baseDomain, lifetime);
    return leaseView(lease, code);
  }
  issueNativeHtml(
    caller: Caller,
    publication: HtmlPublication,
    lifetime?: 'persistent',
  ): NativeHtmlLease {
    const { scope, code } = this.allocateScope(caller, publication, lifetime);
    const lease: NativeViewerLease = { ...scope, purpose: 'native-html', publication };
    this.register(lease, code);
    return {
      purpose: 'native-html',
      id: lease.id,
      bootstrap_code: code,
      publication_id: publication.view.id,
      revision: publication.view.revision,
      profile_id: lease.profileId,
      expires_at: viewerLeaseExpiration(lease),
    };
  }
  private allocate(
    caller: Caller,
    publication: PreviewSource,
    baseDomain: string,
    lifetime: 'persistent' | undefined,
  ): { readonly lease: ViewerLease; readonly code: string } {
    const { scope, code } = this.allocateScope(caller, publication, lifetime);
    const lease: ViewerLease = {
      ...scope,
      purpose: 'gateway',
      host: `${randomBytes(18).toString('hex')}.${baseDomain}`,
      credential: randomBytes(32).toString('hex'),
    };
    this.hosts.set(lease.host, lease);
    this.register(lease, code);
    return { lease, code };
  }
  private allocateScope(
    caller: Caller,
    publication: PreviewSource,
    lifetime: 'persistent' | undefined,
  ): { readonly scope: LeaseScope; readonly code: string } {
    if (caller.kind !== 'client')
      throw new ApiError('forbidden', 'Browser leases require the actual paired viewer.');
    if (previewNeedsOwner(publication) && caller.client.role !== 'owner')
      throw new ApiError(
        'forbidden',
        'Only an authorized owner can view paired-computer development services.',
      );
    if (this.entries.size >= 256)
      throw new ApiError('conflict', 'The concurrent preview lease limit was reached.');
    const scope: LeaseScope = {
      id: randomBytes(32).toString('hex'),
      publication,
      clientId: caller.client.id,
      profileId: publication.view.profile_id,
      expires: lifetime === 'persistent' ? null : Date.now() + LEGACY_LEASE_MS,
      bootstrapExpires: Date.now() + BOOTSTRAP_MS,
      abort: new AbortController(),
      assetToken: randomBytes(32).toString('hex'),
    };
    setMaxListeners(LEASE_LISTENERS_MAX, scope.abort.signal);
    return { scope, code: randomBytes(32).toString('hex') };
  }
  private register(lease: PreviewLease, code: string): void {
    this.entries.set(lease.id, lease);
    this.codes.set(code, lease);
    const timer = setTimeout(() => {
      this.close(lease);
    }, BOOTSTRAP_MS);
    timer.unref();
    this.timers.set(lease.id, timer);
  }
  native(id: string): NativeViewerLease {
    const lease = this.entries.get(id);
    if (lease?.purpose !== 'native-html')
      throw new ApiError('not_found', 'Unknown native HTML presentation lease.');
    this.validate(lease);
    return lease;
  }
  bootstrapNative(id: string, code: string): NativeViewerLease {
    const lease = this.native(id);
    this.consume(lease, code);
    return lease;
  }
  private consume(lease: PreviewLease, code: string): void {
    if (this.codes.get(code) !== lease || lease.bootstrapExpires <= Date.now())
      throw new ApiError('forbidden', 'Preview bootstrap is expired or already consumed.');
    this.codes.delete(code);
    this.claimed.add(lease.id);
    clearTimeout(this.timers.get(lease.id));
    this.timers.delete(lease.id);
    if (lease.expires !== null) {
      const timer = setTimeout(
        () => {
          this.close(lease);
        },
        Math.max(0, lease.expires - Date.now()),
      );
      timer.unref();
      this.timers.set(lease.id, timer);
    }
  }

  asset(id: string): PreviewLease {
    const lease = this.entries.get(id);
    if (lease === undefined || !this.claimed.has(id))
      throw new ApiError(
        'forbidden',
        'Project assets require their live consumed presentation claim.',
      );
    this.validate(lease);
    return lease;
  }
  host(host: string): ViewerLease {
    const lease = this.hosts.get(host);
    if (lease === undefined) throw new ApiError('not_found', 'Unknown isolated preview host.');
    this.validate(lease);
    return lease;
  }
  bootstrap(host: string, code: string): ViewerLease {
    const lease = this.host(host);
    if (lease.expires === null && !this.owners.has(lease.id))
      throw new ApiError(
        'forbidden',
        'Persistent gateway previews require their live paired owner.',
      );
    this.consume(lease, code);
    return lease;
  }
  authenticate(host: string, cookie: string | undefined): ViewerLease {
    const lease = this.host(host);
    const matches = (cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${PREVIEW_COOKIE}=`));
    if (matches.length !== 1 || matches[0] !== `${PREVIEW_COOKIE}=${lease.credential}`)
      throw new ApiError('unauthorized', 'The browser has no current single-service lease.');
    return lease;
  }
  validate(lease: LeaseScope): void {
    const client = this.store.clients.byId(lease.clientId);
    const current = this.publications.require(lease.publication.view.id);
    if (
      (lease.expires !== null && Date.now() >= lease.expires) ||
      lease.abort.signal.aborted ||
      (previewNeedsOwner(current) && client.role !== 'owner') ||
      this.store.profiles.activeOf(client.id).id !== lease.profileId ||
      current !== lease.publication
    )
      throw new ApiError(
        'forbidden',
        'The viewer profile, publication or execution generation changed.',
      );
  }
  release(
    caller: Caller,
    chat: string,
    identity: AiPreviewLease | AiHtmlPreviewLease | NativeHtmlLease,
  ): void {
    const lease = this.viewer(caller, chat, identity);
    if (lease !== undefined) this.close(lease);
  }
  own(
    caller: Caller,
    chat: string,
    identity: AiPreviewLease | AiHtmlPreviewLease,
    retired: () => void,
  ): () => void {
    const lease = this.viewer(caller, chat, identity);
    if (lease?.purpose !== 'gateway' || lease.expires !== null || this.owners.has(lease.id))
      throw new ApiError(
        'forbidden',
        'This persistent gateway lease already ended or has another owner.',
      );
    this.validate(lease);
    this.owners.add(lease.id);
    lease.abort.signal.addEventListener('abort', retired, { once: true });
    return (): void => {
      lease.abort.signal.removeEventListener('abort', retired);
      this.close(lease);
    };
  }
  private viewer(
    caller: Caller,
    chat: string,
    identity: AiPreviewLease | AiHtmlPreviewLease | NativeHtmlLease,
  ): PreviewLease | undefined {
    if (caller.kind !== 'client')
      throw new ApiError('forbidden', 'Preview retirement requires its actual paired viewer.');
    const lease =
      'purpose' in identity
        ? this.entries.get(identity.id)
        : this.hosts.get(new URL(identity.origin).host);
    if (lease === undefined) return undefined;
    if (
      lease.clientId !== caller.client.id ||
      lease.profileId !== identity.profile_id ||
      lease.publication.view.chat_id !== chat ||
      lease.publication.view.id !== identity.publication_id ||
      lease.publication.view.revision !== identity.revision
    )
      throw new ApiError(
        'forbidden',
        'Preview retirement belongs to another viewer or publication.',
      );
    return lease;
  }
  private revalidate(): void {
    for (const lease of [...this.entries.values()]) {
      try {
        this.validate(lease);
      } catch (cause) {
        if (!(cause instanceof Error))
          throw new ApiError('internal', 'Viewer lease revalidation failed without an Error.');
        this.close(lease);
      }
    }
  }
  close(lease: PreviewLease): void {
    this.claimed.delete(lease.id);
    this.owners.delete(lease.id);
    lease.abort.abort();
    this.entries.delete(lease.id);
    if (lease.purpose === 'gateway') this.hosts.delete(lease.host);
    for (const [code, entry] of this.codes) if (entry === lease) this.codes.delete(code);
    clearTimeout(this.timers.get(lease.id));
    this.timers.delete(lease.id);
  }
  stop(): void {
    for (const unsub of this.unsubscribe) unsub();
    for (const lease of [...this.entries.values()]) this.close(lease);
  }
}

function leaseView(lease: ViewerLease, code: string): AiHtmlPreviewLease {
  const origin = `https://${lease.host}`;
  return {
    publication_id: lease.publication.view.id,
    revision: lease.publication.view.revision,
    profile_id: lease.profileId,
    origin,
    url: `${origin}/.se-preview/bootstrap?code=${code}`,
    expires_at: viewerLeaseExpiration(lease),
  };
}

export function viewerLeaseExpiration(lease: Pick<ViewerLease, 'expires'>): string | null {
  return lease.expires === null ? null : new Date(lease.expires).toISOString();
}
