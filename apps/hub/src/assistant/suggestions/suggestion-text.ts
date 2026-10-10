import {
  REPLY_SUGGESTIONS_EMBED,
  REPLY_SUGGESTIONS_MAX,
  REPLY_SUGGESTION_TEXT_MAX,
  type ReplySuggestionsEmbed,
} from '@smarteverything/domain';
import type { ChatMessage } from '../../openrouter/chat-types';

const PART_CHARS = 1500;

const INSTRUCTIONS = `You suggest what a person might say next in a chat with their home AI. Reply with at most ${String(REPLY_SUGGESTIONS_MAX)} short replies the person could send, one per line, each under ${String(REPLY_SUGGESTION_TEXT_MAX)} characters, written as the person and in the language of the conversation. No numbering, quotes or emoji. If nothing useful can be suggested, reply with nothing.`;

const BULLET = /^[\s\-*•\d.)]+/;

const QUOTES = /^["“”«»„'`]+|["“”«»„'`]+$/g;

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function suggestionMessages(person: string, reply: string): ChatMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: `Person: ${cut(person, PART_CHARS)}\nAI: ${cut(reply, PART_CHARS)}` },
  ];
}

export function cleanSuggestions(raw: string): ReplySuggestionsEmbed | null {
  const lines = raw
    .split('\n')
    .map((line) => line.replace(BULLET, '').replace(QUOTES, '').trim())
    .filter((line) => line !== '' && line.length <= REPLY_SUGGESTION_TEXT_MAX);
  const parsed = REPLY_SUGGESTIONS_EMBED.safeParse({
    kind: 'reply_suggestions',
    suggestions: [...new Set(lines)].slice(0, REPLY_SUGGESTIONS_MAX),
  });
  return parsed.success ? parsed.data : null;
}
