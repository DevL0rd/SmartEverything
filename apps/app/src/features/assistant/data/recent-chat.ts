const RECENT_MS = 5 * 60_000;

let last: { readonly chatId: string; readonly at: number } | null = null;

export function markChatSeen(chatId: string): void {
  last = { chatId, at: Date.now() };
}

export function recentChatId(): string | null {
  return last !== null && Date.now() - last.at < RECENT_MS ? last.chatId : null;
}
