import type { AiChatRow, AiPreviewNotice } from '@smarteverything/domain';
const MAX_CONSUMED_REQUESTS = 256;
export class BrowserPublicationEvents {
  readonly pending = new Map<string, AiPreviewNotice>();
  private readonly consumed = new Set<string>();
  receive(chat: AiChatRow, authorized: boolean, notice: AiPreviewNotice | null): boolean {
    if (!authorized || notice?.chat_id !== chat.id || notice.profile_id !== chat.profile_id)
      return false;
    if (notice.state !== 'published') {
      this.pending.delete(notice.publication_id);
      return true;
    }
    const identity = `${notice.publication_id}:${notice.revision ?? 'service'}:${notice.content_changed === true ? 'content' : 'open'}`;
    if (this.consumed.has(identity)) return false;
    this.remember(identity);
    this.pending.set(notice.publication_id, notice);
    return true;
  }
  private remember(identity: string): void {
    this.consumed.add(identity);
    if (this.consumed.size > MAX_CONSUMED_REQUESTS) {
      const oldest = this.consumed.values().next().value;
      if (oldest !== undefined) this.consumed.delete(oldest);
    }
  }
}
