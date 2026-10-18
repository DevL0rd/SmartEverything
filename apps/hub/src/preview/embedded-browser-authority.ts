import {
  ApiError,
  publicBrowserUrl,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserScope,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { chatCaller } from './chat-caller';
import type { PreviewSources } from './sources';
export class EmbeddedBrowserAuthority {
  constructor(
    private readonly store: Store,
    private readonly sources: Pick<PreviewSources, 'require'>,
  ) {}
  caller(caller: Caller, chat: string): string {
    return chatCaller(this.store, caller, chat, 'Browser control');
  }
  validate(scope: EmbeddedBrowserScope): void {
    this.store.aiChats.chat(scope.chatId);
  }
  action(scope: EmbeddedBrowserScope, action: EmbeddedBrowserAction): void {
    this.validate(scope);
    if (action.kind !== 'open') return;
    if (action.source.kind === 'public') {
      if (!publicBrowserUrl(action.source.url))
        throw new ApiError(
          'forbidden',
          'The browser only accepts public websites or authorized publications.',
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
