import {
  ApiError,
  browsableUrl,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserScope,
} from '@smarteverything/domain';
import { currentProviderToolAuthority } from '../assistant/engines/computer/tool-authority';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { chatCaller } from './chat-caller';
export class EmbeddedBrowserAuthority {
  constructor(private readonly store: Store) {}
  caller(caller: Caller, chat: string): string {
    return chatCaller(this.store, caller, chat, 'Browser control');
  }
  initiatingClient(caller: Caller): string | undefined {
    if (currentProviderToolAuthority() === undefined || caller.kind !== 'client') return undefined;
    return caller.authority?.client_id ?? undefined;
  }
  validate(scope: EmbeddedBrowserScope): void {
    this.store.aiChats.chat(scope.chatId);
  }
  action(scope: EmbeddedBrowserScope, action: EmbeddedBrowserAction): void {
    this.validate(scope);
    if (
      action.kind === 'open' &&
      action.source.kind === 'public' &&
      !browsableUrl(action.source.url)
    )
      throw new ApiError(
        'forbidden',
        'The browser opens http or https addresses without a user name or password.',
      );
  }
}
