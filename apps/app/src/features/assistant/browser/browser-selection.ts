import type { BrowserTarget, ChatPage } from '@smarteverything/domain';
export type BrowserSelection =
  | { readonly kind: 'public'; readonly target: BrowserTarget }
  | { readonly kind: 'project'; readonly target: BrowserTarget; readonly page: ChatPage };
