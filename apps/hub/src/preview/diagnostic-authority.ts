import { ApiError, type PreviewDiagnosticScope } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';
import { isHtmlPreview, type PreviewSources } from './sources';
import type { PreviewLeases } from './leases';
export class PreviewDiagnosticAuthority {
  constructor(
    private readonly store: Store,
    private readonly sources: PreviewSources,
    private readonly leases: PreviewLeases,
  ) {}
  caller(caller: Caller, chat: string): string {
    const profile = profileIdOf(this.store, caller);
    if (
      this.store.aiChats.chat(chat).profile_id !== profile ||
      ((caller.kind === 'client' || caller.kind === 'service') &&
        caller.chatId !== undefined &&
        caller.chatId !== null &&
        caller.chatId !== chat)
    )
      throw new ApiError(
        'forbidden',
        'Preview diagnostics must remain in the initiating chat and profile.',
      );
    return profile;
  }
  validate(scope: PreviewDiagnosticScope): void {
    const client = this.store.clients.byId(scope.clientId);
    if (
      this.store.profiles.activeOf(client.id).id !== scope.profileId ||
      this.store.aiChats.chat(scope.chatId).profile_id !== scope.profileId
    )
      throw new ApiError('forbidden', 'The viewer chat or active profile changed.');
    if (this.stablePage(scope)) return;
    if (scope.revision === null) {
      if (!scope.browserId.startsWith('public:') || scope.documentId !== scope.browserId)
        throw new ApiError('forbidden', 'The public browser identity is invalid.');
      return;
    }
    this.publication(scope);
  }
  private stablePage(scope: PreviewDiagnosticScope): boolean {
    if (
      scope.revision !== null ||
      !scope.browserId.startsWith(`${scope.documentId}:page:${scope.profileId}:`)
    )
      return false;
    const page = this.sources.require(scope.documentId);
    if (
      !isHtmlPreview(page) ||
      page.view.chat_id !== scope.chatId ||
      page.view.profile_id !== scope.profileId
    )
      throw new ApiError('forbidden', 'This page belongs to another chat.');
    return true;
  }
  private publication(scope: PreviewDiagnosticScope): void {
    const current = this.sources.require(scope.documentId);
    if (
      current.view.revision !== scope.revision ||
      current.view.chat_id !== scope.chatId ||
      current.view.profile_id !== scope.profileId
    )
      throw new ApiError('forbidden', 'The preview publication or revision changed.');
    const prefix = `${scope.documentId}:${scope.revision}:`;
    if (!scope.browserId.startsWith(prefix))
      throw new ApiError('forbidden', 'The browser publication binding changed.');
    const suffix = scope.browserId.slice(prefix.length);
    const lease = suffix.startsWith('native:')
      ? this.leases.native(suffix.slice(7))
      : this.leases.host(new URL(suffix).host);
    this.leases.validate(lease);
    if (
      lease.clientId !== scope.clientId ||
      lease.profileId !== scope.profileId ||
      lease.publication.view.id !== scope.documentId
    )
      throw new ApiError('forbidden', 'The browser lease belongs to another viewer.');
  }
}
