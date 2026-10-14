import {
  responseStyleGuidance,
  type AssistantResponseStyle,
  type AiChatRow,
  type Role,
} from '@smarteverything/domain';
import { FORMAT_MANNER, TOOL_GUIDE, TOOL_MANNER, WIDGET_MANNER } from '../../ai-tools/tool-guide';

export interface PromptFacts {
  readonly name: string;
  readonly executionHost?: string;
  readonly profileName: string;
  readonly role: Role;
  readonly homeName: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly instructions: string;
  readonly responseStyle?: AssistantResponseStyle | undefined;
  readonly guide?: string;
  readonly toolIndex: string;
  readonly catalogue: string;
  readonly chat: Pick<AiChatRow, 'id' | 'title' | 'kind'>;
}

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
  'Reply in chat text at the depth the task and response style call for. After acting, say what you did.',
].join('\n');

export function stablePrompt(facts: PromptFacts): string {
  return [
    `You are ${facts.name}, the AI of SmartEverything for the home "${facts.homeName}", running on ${facts.executionHost ?? "the home's own server"}.`,
    RULES,
    facts.toolIndex === ''
      ? ''
      : `Other enabled home tools for call_tool; use the exact schema from tool_details when available, or the schema supplied here:\n${facts.toolIndex}`,
    facts.guide ?? TOOL_GUIDE,
    facts.responseStyle === undefined ? '' : responseStyleGuidance(facts.responseStyle),
    facts.instructions === '' ? '' : `Owner instructions:\n${facts.instructions}`,
    facts.catalogue === ''
      ? ''
      : `Enabled plugin tools for call_tool; use the exact schema from tool_details when available, or the schema supplied here:\n${facts.catalogue}`,
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
