import type { ChatEntry } from './chat-entry';
import type { ChatSource } from '../model/chat-source';

export type RowAvatar =
  | { readonly kind: 'computer'; readonly computerId: string }
  | { readonly kind: 'source'; readonly source: ChatSource };

export function avatarOf(entry: ChatEntry): RowAvatar {
  return entry.computerId === null
    ? { kind: 'source', source: entry.source }
    : { kind: 'computer', computerId: entry.computerId };
}
