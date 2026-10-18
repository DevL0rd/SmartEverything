import { ApiError, type PreviewDiagnosticScope } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { chatCaller } from './chat-caller';
import type { PreviewSources } from './sources';

function isPublicDocument(documentId: string): boolean {
  return documentId.startsWith('public:');
}

export class PreviewDiagnosticAuthority {
  constructor(
    private readonly store: Store,
    private readonly sources: Pick<PreviewSources, 'require'>,
  ) {}
  caller(caller: Caller, chat: string): string {
    return chatCaller(this.store, caller, chat, 'Preview diagnostics');
  }
  validate(scope: PreviewDiagnosticScope): string | null {
    this.store.aiChats.chat(scope.chatId);
    if (isPublicDocument(scope.documentId)) return null;
    const current = this.sources.require(scope.documentId);
    if (
      current.view.chat_id !== scope.chatId ||
      current.view.profile_id !== scope.profileId ||
      (scope.revision !== null && current.view.revision !== scope.revision)
    )
      throw new ApiError('forbidden', 'The preview publication or revision changed.');
    return current.view.revision;
  }
}
