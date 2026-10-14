import { ApiError } from '@smarteverything/domain';
import type { ChatMessage } from '../openrouter/chat-types';
import type { Store } from '../store/store';
export interface SideCompletionDeps {
  readonly auxiliary: (chatId: string) => ((request: SideRequest) => Promise<string>) | null;
  readonly store: Store;
}
export interface SideRequest {
  readonly chatId: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens: number;
}
export class SideCompletion {
  constructor(private readonly deps: SideCompletionDeps) {}
  nativeAvailable(chatId: string): boolean {
    return this.deps.auxiliary(chatId) !== null;
  }
  complete(request: SideRequest): Promise<string> {
    const native = this.deps.auxiliary(request.chatId);
    if (native === null)
      throw new ApiError('conflict', 'The selected engine supplies no auxiliary completion.');
    return native(request);
  }
}
