import {
  responseStyleGuidance,
  type AssistantResponseStyle,
  type AiChatRow,
  type Role,
} from '@smarteverything/domain';
import {
  CHANGE_MANNER,
  DATE_MANNER,
  FORMAT_MANNER,
  TOOL_GUIDE,
  TOOL_MANNER,
  WIDGET_MANNER,
} from '../../ai-tools/tool-guide';
import { personalitySection } from '../personality';

export interface PromptFacts {
  readonly name: string;
  readonly executionHost?: string;
  readonly profileName: string;
  readonly role: Role;
  readonly homeName: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly boardTypes: readonly string[];
  readonly interruption: string | null;
  readonly sender?: string;
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
    : `Person: ${facts.profileName}, a member of the home: they may ask about and control the home; computer work, code, files, accounts and the AI and tool steps of automations are the owner's. You can reach only this person's own chats and the files of those chats.`;
}

const MID_WORK_MANNER =
  'A message the person sends while you work reaches you at your next tool call as: User message received while you were working: "...". Answer or acknowledge it in a sentence or two right away, then carry on with your current work. Stop or change course only if it tells you to stop, redirects you, or gives new work that conflicts with what you are doing.';

export function midWorkMessage(text: string): string {
  return `User message received while you were working: ${JSON.stringify(text)}`;
}

const INTERRUPTED_MANNER =
  'A context note may say your previous turn was interrupted. Carry on with that work as the note says, without commenting on the note.';

const RULES = [
  `Tools are how you see and change the home; their results are facts. ${TOOL_MANNER} ${WIDGET_MANNER} ${FORMAT_MANNER}`,
  `${CHANGE_MANNER} ${DATE_MANNER}`,
  'Chats are separate conversations of one person. chat_send messages another of their chats; subagent_run starts a helper chat that sees only the task you write, not this conversation; answers from both arrive here as reports.',
  'The Writing from line in your context names the device the person is typing on and, for a computer, its room (a phone has none). Use it for here and this room, and find that device with find_devices search.',
  'Reply in chat text at the depth the task and response style call for. After acting, say what you did.',
  MID_WORK_MANNER,
  INTERRUPTED_MANNER,
].join('\n');

export function stablePrompt(facts: PromptFacts): string {
  return [
    `You are ${facts.name}, the AI of SmartEverything for the home "${facts.homeName}", running on ${facts.executionHost ?? "the home's own server"}.`,
    personalitySection(facts.responseStyle, facts.instructions),
    RULES,
    facts.toolIndex === ''
      ? ''
      : `Other enabled home tools for call_tool; use the exact schema from tool_details when available, or the schema supplied here:\n${facts.toolIndex}`,
    facts.guide ?? TOOL_GUIDE,
    facts.responseStyle === undefined ? '' : responseStyleGuidance(facts.responseStyle),
    facts.catalogue === ''
      ? ''
      : `Enabled plugin tools for call_tool; use the exact schema from tool_details when available, or the schema supplied here:\n${facts.catalogue}`,
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

function boardsLine(facts: PromptFacts): string {
  return facts.boardTypes.length === 0
    ? ''
    : `Board types for show_widgets kind board: ${facts.boardTypes.join(', ')}.`;
}

export function turnPrompt(facts: PromptFacts): string {
  return [
    '[Context for this reply, not from the person]',
    roleLine(facts),
    chatLine(facts),
    facts.sender === undefined ? '' : `Writing from: ${facts.sender}.`,
    `Local time: ${localTime(facts)} (${facts.timeZone}).`,
    boardsLine(facts),
    facts.interruption === null ? '' : `Note: ${facts.interruption}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
