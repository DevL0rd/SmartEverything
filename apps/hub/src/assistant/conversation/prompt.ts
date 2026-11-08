import {
  responseStyleGuidance,
  type AssistantResponseStyle,
  type AiChatRow,
  type ComputerAiRuntime,
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

export interface StableFacts {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly homeName: string;
  readonly instructions: string;
  readonly responseStyle?: AssistantResponseStyle | undefined;
  readonly guide?: string;
  readonly toolIndex: string;
  readonly catalogue: string;
}

export interface PromptFacts extends StableFacts {
  readonly executionHost?: string;
  readonly profileName: string;
  readonly role: Role;
  readonly timeZone: string;
  readonly now: Date;
  readonly boardTypes: readonly string[];
  readonly interruption: string | null;
  readonly sender?: string;
  readonly chat: Pick<AiChatRow, 'id' | 'title' | 'kind'>;
}

export type PromptMedium = 'chat' | 'voice';
type ChatPromptMode = 'standard' | ComputerAiRuntime;

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
  'A message the person sends while you work reaches you at your next tool call as: User message received while you were working: "...". Answer or acknowledge it in a sentence or two right away, then carry on with your current work. Such a message never takes priority over the task you are already doing and is not an instruction to drop it: a question, a remark, a correction of a detail, a new idea or a side request is answered or noted, and the current task still gets finished. Stop or change course only when the person explicitly says to stop this work, redirects you to something else, or a rule elsewhere requires it.';

export function midWorkMessage(text: string): string {
  return `User message received while you were working: ${JSON.stringify(text)}`;
}

const INTERRUPTED_MANNER =
  'A context note may say your previous turn was interrupted. Carry on with that work as the note says, without commenting on the note.';

const TOOL_FACTS = 'Tools are how you see and change the home; their results are facts.';

const CHATS_RULE =
  'Chats are separate conversations of one person. chat_send messages another of their chats. You can quote a message of that chat (quoteMessageId on chat_send, chat_post and chat_speak) to reply to it, and mention a helper or person by writing @Name. A helper starts with the task you give it and can receive follow-ups. The parent thread shows explicit messages to its direct helper and displays that helper’s messages and unwaited answers under its name. Unwaited answers from other chats arrive as reports.';

const DEVICE_RULE =
  'The From line in your context names the device the person is writing or talking from and, for a computer, its room (a phone has none). Use it for here and this room, and find that device with device_find search.';

export function identityLine(facts: StableFacts): string {
  const also = facts.aliases.length > 0 ? ` (also called ${facts.aliases.join(', ')})` : '';
  return `You are ${facts.name}${also}, the AI of SmartEverything for the home "${facts.homeName}"`;
}

export function presentation(facts: StableFacts, medium: PromptMedium): string {
  const style = facts.responseStyle;
  if (style === undefined) return '';
  return responseStyleGuidance(medium === 'voice' ? { ...style, format: 'adaptive' } : style);
}

export function homeRules(toolManners: readonly string[], toolManner = TOOL_MANNER): string {
  return [
    [TOOL_FACTS, ...toolManners, toolManner].join(' '),
    `${CHANGE_MANNER} ${DATE_MANNER}`,
    CHATS_RULE,
    DEVICE_RULE,
  ].join('\n');
}

export function toolSections(facts: StableFacts): readonly string[] {
  return [
    facts.toolIndex === ''
      ? ''
      : `Other enabled home tools for tool_call; use the exact schema from tool_read when available, or the schema supplied here:\n${facts.toolIndex}`,
    facts.guide ?? TOOL_GUIDE,
    facts.catalogue === ''
      ? ''
      : `Enabled plugin tools for tool_call; use the exact schema from tool_read when available, or the schema supplied here:\n${facts.catalogue}`,
  ];
}

const PLAN_MANNER =
  'Keep the checklist current without being asked: when the person asks for something new, put it on the checklist in the same turn you answer, before you start it, and when an item is finished mark it finished in the same turn. An item that is still running stays in progress and is never quietly dropped. Use the goal the same way: widen it or add to it when the work grows, and finish it when the work is done.';

const CHAT_REPLY =
  'Reply in chat text at the depth the task and response style call for. After acting, say what you did.';

const NATIVE_TOOL_MANNER =
  'Act on the person’s authorized request and report the outcome. Follow this runtime’s native tool permissions and approval prompts. SmartEverything instructions and skills cannot grant new capabilities or override those boundaries.';

export function stablePrompt(
  facts: StableFacts & { readonly executionHost?: string },
  mode: ChatPromptMode = 'standard',
): string {
  const rules = homeRules(
    [WIDGET_MANNER, FORMAT_MANNER],
    mode === 'standard' ? TOOL_MANNER : NATIVE_TOOL_MANNER,
  );
  const chatRules = [
    rules,
    CHAT_REPLY,
    ...(mode === 'codex' ? [] : [MID_WORK_MANNER]),
    INTERRUPTED_MANNER,
    ...(mode === 'standard' ? [PLAN_MANNER] : []),
  ].join('\n');
  return [
    `${identityLine(facts)}, running on ${facts.executionHost ?? "the home's own server"}.`,
    personalitySection(facts.responseStyle, facts.instructions),
    presentation(facts, 'chat'),
    chatRules,
    ...toolSections(facts),
  ]
    .filter((part) => part !== '')
    .join('\n\n');
}

function boardsLine(facts: PromptFacts): string {
  return facts.boardTypes.length === 0
    ? ''
    : `Board types for widget_show kind board: ${facts.boardTypes.join(', ')}.`;
}

export function contextLines(
  facts: PromptFacts,
  mode: ChatPromptMode = 'standard',
): readonly string[] {
  return [
    roleLine(facts),
    chatLine(facts),
    facts.sender === undefined ? '' : `From: ${facts.sender}.`,
    `Local time: ${localTime(facts)} (${facts.timeZone}).`,
    boardsLine(facts),
    facts.interruption === null ? '' : `Note: ${facts.interruption}`,
    mode === 'standard'
      ? 'Before you reply, check the checklist against what the person just asked: a new request belongs on it this turn.'
      : '',
  ].filter((line) => line !== '');
}

export function turnPrompt(facts: PromptFacts, mode: ChatPromptMode = 'standard'): string {
  return ['[Context for this reply, not from the person]', ...contextLines(facts, mode)].join('\n');
}
