import type { AiChatRow } from '@smarteverything/domain';
import { chatSourceOf, type PluginNames } from '../model/chat-source';
import { isComputerEngine } from '../provider/computer-engine';
import type { ChatEntry, ChatLine } from './chat-entry';

interface ChatFailure {
  readonly sent: boolean;
  readonly reason: string;
}

export interface ChatPreview {
  readonly text: string;
  readonly at: string;
  readonly speaker: string | null;
  readonly failure: ChatFailure | null;
}

export interface ChatWork {
  readonly step: string | null;
}

export interface EntrySources {
  readonly previews: ReadonlyMap<string, ChatPreview>;
  readonly working: ReadonlyMap<string, ChatWork>;
  readonly plugins: PluginNames;
}

function lineOf(
  chat: AiChatRow,
  preview: ChatPreview | undefined,
  work: ChatWork | undefined,
): ChatLine {
  if (work !== undefined) {
    return { kind: 'working', step: work.step };
  }
  if (preview?.failure !== null && preview?.failure !== undefined) {
    return { kind: 'failed', ...preview.failure };
  }
  if (preview !== undefined) {
    return { kind: 'preview', speaker: preview.speaker, text: preview.text };
  }
  if (chat.archived_at !== null) {
    return { kind: 'archived' };
  }
  return { kind: 'empty' };
}

export function entryOf(chat: AiChatRow, sources: EntrySources): ChatEntry {
  const preview = sources.previews.get(chat.id);
  return {
    id: chat.id,
    kind: chat.kind,
    title: chat.title,
    source: chatSourceOf(chat, sources.plugins),
    at: chat.last_message_at ?? preview?.at ?? chat.created_at,
    pinned: chat.pinned,
    archived: chat.archived_at !== null,
    unread: chat.unread_count,
    requests: chat.pending_requests,
    parentId: chat.parent_id,
    runtime: isComputerEngine(chat.engine) ? chat.engine.kind : null,
    computerId: isComputerEngine(chat.engine) ? chat.engine.device_id : null,
    line: lineOf(chat, preview, sources.working.get(chat.id)),
  };
}

export function matchesChat(entry: ChatEntry, needle: string): boolean {
  const { line } = entry;
  return (
    entry.title.toLowerCase().includes(needle) ||
    entry.source.label.toLowerCase().includes(needle) ||
    (line.kind === 'preview' && line.text.toLowerCase().includes(needle))
  );
}
