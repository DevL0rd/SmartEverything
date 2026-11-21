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
  caller(caller: Caller, chat: string): Promise<string> {
    return chatCaller(this.store, caller, chat, 'Browser control');
  }
  initiatingClient(caller: Caller): string | undefined {
    if (currentProviderToolAuthority() === undefined || caller.kind !== 'client') return undefined;
    return caller.authority?.client_id ?? undefined;
  }
  async validate(scope: EmbeddedBrowserScope): Promise<void> {
    await this.store.host.call('aiChats', 'chat', scope.chatId);
  }
  async action(scope: EmbeddedBrowserScope, action: EmbeddedBrowserAction): Promise<void> {
    await this.validate(scope);
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
