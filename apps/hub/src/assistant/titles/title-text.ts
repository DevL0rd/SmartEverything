import { AI_CHAT_TITLE_MAX } from '@smarteverything/domain';
import type { ChatMessage } from '../../openrouter/chat-types';

export const TITLE_WORDS_MAX = 6;

const PART_CHARS = 1500;

const SOURCE_CHARS = 4000;

const INSTRUCTIONS = `You name conversations. Reply with only a title for the conversation below: at most ${String(TITLE_WORDS_MAX)} words, sentence case, no quotes, no emoji, no full stop. Write it in the language of the conversation.`;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

const QUOTES = /["“”«»„`*_#]/g;

const EDGES = /^[\s'‘’:.,;!?-]+|[\s'‘’:.,;!?-]+$/g;

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function exchangeSource(person: string, reply: string): string {
  return `Person: ${cut(person, PART_CHARS)}\nAI: ${cut(reply, PART_CHARS)}`;
}

export function callSource(transcript: string): string {
  return `Voice call transcript:\n${cut(transcript, SOURCE_CHARS)}`;
}

export function titleMessages(source: string): ChatMessage[] {
  return [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: source },
  ];
}

export function cleanTitle(raw: string): string | null {
  const line = (raw.trim().split('\n')[0] ?? '').replace(/^title:\s*/i, '');
  const words = line
    .replace(EMOJI, '')
    .replace(QUOTES, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, TITLE_WORDS_MAX);
  const title = words.join(' ').replace(EDGES, '').slice(0, AI_CHAT_TITLE_MAX);
  return title === '' ? null : `${title.charAt(0).toUpperCase()}${title.slice(1)}`;
}
