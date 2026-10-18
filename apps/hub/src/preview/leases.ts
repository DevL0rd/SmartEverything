import { setMaxListeners } from 'node:events';
import { effectiveClientById } from '../server/person-access';
import { randomBytes } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type { AiPreviewLease, AiHtmlPreviewLease, NativeHtmlLease } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import type { Publication } from './publications';
import type { HtmlPublication } from './documents';
import { onPreviewAuthorityChange } from './authority-events';
import { previewNeedsOwner, type PreviewSource, type PreviewSources } from './sources';
const LEASE_LISTENERS_MAX = 64;
const log = new Logger('hub.preview');
const tag = (id: string): string => id.slice(0, 6);
export const PREVIEW_COOKIE = '__Host-se-preview';
interface LeaseScope {
  readonly id: string;
  readonly publication: PreviewSource;
  readonly clientId: string;
  readonly profileId: string;
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
  private readonly unsubscribe: readonly (() => void)[];
  constructor(
    private readonly store: Store,
    private readonly publications: Pick<PreviewSources, 'require' | 'onRevoke'>,
  ) {
    this.unsubscribe = [
      onPreviewAuthorityChange(store, () => {
        this.revalidate();
      }),
      publications.onRevoke((id) => {
        for (const lease of this.entries.values())
          if (lease.publication.view.id === id) this.close(lease);
      }),
    ];
  }
  issue(caller: Caller, publication: Publication, baseDomain: string): AiPreviewLease {
    const { lease, code } = this.allocate(caller, publication, baseDomain);
    return {
      ...leaseView(lease, code),
      target: publication.view.target,
      generation: publication.view.generation,
    };
  }
  issueHtml(caller: Caller, publication: HtmlPublication, baseDomain: string): AiHtmlPreviewLease {
    const { lease, code } = this.allocate(caller, publication, baseDomain);
    return leaseView(lease, code);
  }
  issueNativeHtml(caller: Caller, publication: HtmlPublication): NativeHtmlLease {
    const { scope, code } = this.allocateScope(caller, publication);
    const lease: NativeViewerLease = { ...scope, purpose: 'native-html', publication };
    this.register(lease, code);
    log.info('lease.issued', {
      purpose: 'native-html',
      lease: tag(lease.id),
      publicationId: publication.view.id,
      chatId: publication.view.chat_id,
      clientId: lease.clientId,
      profileId: lease.profileId,
      leases: this.entries.size,
    });
    return {
      purpose: 'native-html',
      id: lease.id,
      bootstrap_code: code,
      publication_id: publication.view.id,
      revision: publication.view.revision,
      profile_id: lease.profileId,
      expires_at: null,
    };
  }
  private allocate(
    caller: Caller,
    publication: PreviewSource,
    baseDomain: string,
  ): { readonly lease: ViewerLease; readonly code: string } {
    const { scope, code } = this.allocateScope(caller, publication);
    const lease: ViewerLease = {
      ...scope,
      purpose: 'gateway',
      host: `${randomBytes(18).toString('hex')}.${baseDomain}`,
      credential: randomBytes(32).toString('hex'),
    };
    this.hosts.set(lease.host, lease);
    this.register(lease, code);
    log.info('lease.issued', {
      purpose: 'gateway',
      lease: tag(lease.id),
      publicationId: publication.view.id,
      chatId: publication.view.chat_id,
      clientId: lease.clientId,
      profileId: lease.profileId,
      leases: this.entries.size,
    });
    return { lease, code };
  }
  private allocateScope(
    caller: Caller,
    publication: PreviewSource,
  ): { readonly scope: LeaseScope; readonly code: string } {
    if (caller.kind !== 'client') {
      log.warn('lease.refused', {
        reason: 'not_a_paired_viewer',
        callerKind: caller.kind,
        publicationId: publication.view.id,
      });
      throw new ApiError('forbidden', 'Browser leases require the actual paired viewer.');
    }
    if (previewNeedsOwner(publication) && caller.client.role !== 'owner') {
      log.warn('lease.refused', {
        reason: 'owner_required',
        clientId: caller.client.id,
        publicationId: publication.view.id,
      });
      throw new ApiError(
        'forbidden',
        'Only an authorized owner can view paired-computer development services.',
      );
    }
    const scope: LeaseScope = {
      id: randomBytes(32).toString('hex'),
      publication,
      clientId: caller.client.id,
      profileId: publication.view.profile_id,
      abort: new AbortController(),
      assetToken: randomBytes(32).toString('hex'),
    };
    setMaxListeners(LEASE_LISTENERS_MAX, scope.abort.signal);
    return { scope, code: randomBytes(32).toString('hex') };
  }
  private register(lease: PreviewLease, code: string): void {
    this.entries.set(lease.id, lease);
    this.codes.set(code, lease);
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
    if (this.codes.get(code) !== lease) {
      log.warn('lease.bootstrap_rejected', {
        lease: tag(lease.id),
        purpose: lease.purpose,
        reason: 'unknown_or_consumed',
        codeLength: code.length,
      });
      throw new ApiError('forbidden', 'Preview bootstrap is unknown or already consumed.');
    }
    this.codes.delete(code);
    this.claimed.add(lease.id);
    log.info('lease.bootstrap_consumed', {
      lease: tag(lease.id),
      purpose: lease.purpose,
      publicationId: lease.publication.view.id,
      claimed: this.claimed.size,
    });
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
    if (!this.owners.has(lease.id))
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
    if (matches.length !== 1 || matches[0] !== `${PREVIEW_COOKIE}=${lease.credential}`) {
      log.warn('lease.cookie_rejected', {
        lease: tag(lease.id),
        cookieCount: matches.length,
        cookieHeaderLength: (cookie ?? '').length,
      });
      throw new ApiError('unauthorized', 'The browser has no current single-service lease.');
    }
    return lease;
  }
  validate(lease: LeaseScope): void {
    const client = effectiveClientById(this.store, lease.clientId);
    const current = this.publications.require(lease.publication.view.id);
    const aborted = lease.abort.signal.aborted;
    const ownerLost = previewNeedsOwner(current) && client.role !== 'owner';
    const profileMoved = this.store.profiles.activeOf(client.id).id !== lease.profileId;
    const republished = current !== lease.publication;
    if (aborted || ownerLost || profileMoved || republished) {
      log.debug('lease.invalid', () => ({
        lease: tag(lease.id),
        aborted,
        ownerLost,
        profileMoved,
        republished,
      }));
      throw new ApiError(
        'forbidden',
        'The viewer profile, publication or execution generation changed.',
      );
    }
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
    if (lease?.purpose !== 'gateway' || this.owners.has(lease.id))
      throw new ApiError(
        'forbidden',
        'This persistent gateway lease already ended or has another owner.',
      );
    this.validate(lease);
    this.owners.add(lease.id);
    log.debug('lease.owned', () => ({
      lease: tag(lease.id),
      chatId: chat,
      owners: this.owners.size,
    }));
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
    if (lease.clientId !== caller.client.id || lease.publication.view.chat_id !== chat)
      throw new ApiError('forbidden', 'Preview retirement belongs to another viewer or chat.');
    return lease;
  }
  private revalidate(): void {
    log.debug('lease.revalidating', { leases: this.entries.size });
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
    log.info('lease.closed', {
      lease: tag(lease.id),
      purpose: lease.purpose,
      publicationId: lease.publication.view.id,
      claimed: this.claimed.has(lease.id),
      remaining: Math.max(0, this.entries.size - 1),
    });
    this.claimed.delete(lease.id);
    this.owners.delete(lease.id);
    lease.abort.abort();
    this.entries.delete(lease.id);
    if (lease.purpose === 'gateway') this.hosts.delete(lease.host);
    for (const [code, entry] of this.codes) if (entry === lease) this.codes.delete(code);
  }
  stop(): void {
    log.info('lease.stopping', { leases: this.entries.size });
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
    expires_at: null,
  };
}
