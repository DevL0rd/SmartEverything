import type { AiChatRow, AssistantMessageRow, Role } from '@smarteverything/domain';
import type { ChatMessage, ContentPart } from '../../../openrouter/chat-types';
import {
  FORMAT_MANNER,
  TOOL_GUIDE,
  TOOL_MANNER,
  WIDGET_MANNER,
} from '../../../ai-tools/tool-guide';
import type { MediaView } from './media-view';

export interface PromptFacts {
  readonly name: string;
  readonly profileName: string;
  readonly role: Role;
  readonly homeName: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly instructions: string;
  readonly toolIndex: string;
  readonly catalogue: string;
  readonly chat: Pick<AiChatRow, 'id' | 'title' | 'kind'>;
}

const AI_SOURCES: ReadonlySet<string> = new Set(['chat', 'subagent']);

function localTime(facts: PromptFacts): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: facts.timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(facts.now);
}

function chatLine(facts: PromptFacts): string {
  const { chat } = facts;
  const subagent =
    chat.kind === 'subagent'
      ? ' It is a subagent chat: do the task it was given and end with the result, which goes back to the chat that started it.'
      : '';
  return `Chat: "${chat.title}" (chatId ${chat.id}).${subagent}`;
}

function roleLine(facts: PromptFacts): string {
  return facts.role === 'owner'
    ? `Person: ${facts.profileName}, the owner of the home.`
    : `Person: ${facts.profileName}, a member of the home: they may ask about and control the home; computer work, code, files and accounts are the owner's.`;
}

const RULES = [
  `Tools are how you see and change the home; their results are facts. ${TOOL_MANNER} ${WIDGET_MANNER} ${FORMAT_MANNER}`,
  'Chats are separate conversations of one person. chat_send messages another of their chats; subagent_run starts a helper chat for a task; answers from both arrive here as reports.',
  'Replies are short chat text. After acting, say what you did.',
].join('\n');

export function stablePrompt(facts: PromptFacts): string {
  return [
    `You are ${facts.name}, the AI of SmartEverything for the home "${facts.homeName}", running on the home's own server.`,
    RULES,
    facts.toolIndex === ''
      ? ''
      : `Your tools, each declared with its parameters:\n${facts.toolIndex}`,
    TOOL_GUIDE,
    facts.instructions === '' ? '' : `Owner instructions:\n${facts.instructions}`,
    facts.catalogue === ''
      ? ''
      : `Plugin tools, as name(parameters, ? = optional): what it is. Run one with call_tool:\n${facts.catalogue}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

export function turnPrompt(facts: PromptFacts): string {
  return [
    '[Context for this reply, not from the person]',
    roleLine(facts),
    chatLine(facts),
    `Local time: ${localTime(facts)} (${facts.timeZone}).`,
  ].join('\n');
}

export function stableMessage(facts: PromptFacts): ChatMessage {
  return { role: 'system', content: stablePrompt(facts) };
}

export function turnMessage(facts: PromptFacts): ChatMessage {
  return { role: 'user', content: turnPrompt(facts) };
}

async function personContent(
  row: AssistantMessageRow,
  media: MediaView,
): Promise<string | ContentPart[]> {
  if (row.attachments.length === 0) {
    return row.text;
  }
  const parts: ContentPart[] = row.text === '' ? [] : [{ type: 'text', text: row.text }];
  for (const file of row.attachments) {
    parts.push((await media.part(file, row.id)) ?? { type: 'text', text: media.note(file) });
  }
  return parts;
}

function responderText(row: AssistantMessageRow, media: MediaView): string {
  const files = row.attachments.map((file) => media.note(file));
  return [row.text, ...files].filter((part) => part !== '').join('\n');
}

async function messageOf(row: AssistantMessageRow, media: MediaView): Promise<ChatMessage> {
  if (row.role === 'responder') {
    return { role: 'assistant', content: responderText(row, media) };
  }
  if (row.role === 'system') {
    const label = row.kind === 'call' ? 'Voice call transcript' : 'Note';
    return { role: 'user', content: `[${label}] ${row.text}` };
  }
  const from = row.origin !== null && AI_SOURCES.has(row.origin.source) ? row.origin.name : null;
  const text =
    from === null ? row.text : `[From the chat "${from}", an AI, not the person] ${row.text}`;
  return { role: 'user', content: await personContent({ ...row, text }, media) };
}

export function summaryMessage(text: string): ChatMessage {
  return { role: 'user', content: `[Summary of the earlier part of this chat] ${text}` };
}

export async function historyMessages(
  rows: readonly AssistantMessageRow[],
  media: MediaView,
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];
  for (const row of rows.filter((item) => item.text !== '' || item.attachments.length > 0)) {
    messages.push(await messageOf(row, media));
  }
  return messages;
}
