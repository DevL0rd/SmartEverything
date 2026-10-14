import {
  ApiError,
  publicBrowserUrl,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserScope,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';
import type { PreviewSources } from './sources';
export class EmbeddedBrowserAuthority {
  constructor(
    private readonly store: Store,
    private readonly sources: PreviewSources,
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
        'Browser control must remain in the initiating chat and profile.',
      );
    return profile;
  }
  validate(scope: EmbeddedBrowserScope): void {
    const client = this.store.clients.byId(scope.clientId);
    if (
      this.store.profiles.activeOf(client.id).id !== scope.profileId ||
      this.store.aiChats.chat(scope.chatId).profile_id !== scope.profileId
    )
      throw new ApiError('forbidden', 'The browser viewer chat or active profile changed.');
  }
  action(scope: EmbeddedBrowserScope, action: EmbeddedBrowserAction): void {
    this.validate(scope);
    if (action.kind !== 'open') return;
    if (action.source.kind === 'public') {
      if (!publicBrowserUrl(action.source.url))
        throw new ApiError(
          'forbidden',
          'The browser only accepts public HTTPS websites or authorized publications.',
        );
      return;
    }
    const publication = this.sources.require(action.source.publicationId);
    if (
      publication.view.chat_id !== scope.chatId ||
      publication.view.profile_id !== scope.profileId
    )
      throw new ApiError('forbidden', 'The publication belongs to another chat or profile.');
  }
}
