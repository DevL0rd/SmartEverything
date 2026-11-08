import { z } from 'zod';
import type { AssistantMessageRow } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { participantOf, type Cast } from './participant';
import { speakerOf, type MessageSpeaker } from './speaker';

export type ActionId =
  | 'quote'
  | 'copy'
  | 'select'
  | 'mention'
  | 'retry'
  | 'edit'
  | 'save'
  | 'share'
  | 'branch'
  | 'copy-plain'
  | 'copy-link'
  | 'details'
  | 'react'
  | 'delete';

export interface ActionSpec {
  readonly id: ActionId;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive: boolean;
  readonly shortcut: string | null;
}

export interface ActionContext {
  readonly speaker: MessageSpeaker['kind'];
  readonly hasText: boolean;
  readonly hasMedia: boolean;
  readonly canShareMedia: boolean;
  readonly canEdit: boolean;
  readonly canRetry: boolean;
  readonly canReact: boolean;
  readonly canMention: boolean;
  readonly pointer: boolean;
  readonly groupDialogue?: 'to_helper' | 'from_helper';
  readonly helperInput?: boolean;
  readonly canReplyToHelper?: boolean;
}

export interface ActionPlan {
  readonly reactions: boolean;
  readonly list: readonly ActionSpec[];
}

export const QUICK_REACTIONS: readonly string[] = [
  String.fromCodePoint(0x1f44d),
  String.fromCodePoint(0x2764, 0xfe0f),
  String.fromCodePoint(0x1f602),
  String.fromCodePoint(0x1f62e),
  String.fromCodePoint(0x1f64f),
  String.fromCodePoint(0x1f525),
];

function spec(
  id: ActionId,
  label: string,
  icon: IconName,
  shortcut: string | null = null,
): ActionSpec {
  return { id, label, icon, destructive: id === 'delete', shortcut };
}

const SPECS = {
  quote: spec('quote', 'Quote', 'reply', 'Q'),
  copy: spec('copy', 'Copy', 'copy', 'C'),
  select: spec('select', 'Select text', 'textCursor'),
  mention: spec('mention', 'Mention', 'atSign', 'M'),
  retry: spec('retry', 'Retry', 'refresh', 'R'),
  edit: spec('edit', 'Edit', 'pencil', 'E'),
  save: spec('save', 'Save', 'download', 'S'),
  share: spec('share', 'Share…', 'share'),
  branch: spec('branch', 'Branch from here', 'gitBranch', 'B'),
  'copy-plain': spec('copy-plain', 'Copy as plain text', 'fileText', '⇧C'),
  'copy-link': spec('copy-link', 'Copy link to message', 'link'),
  details: spec('details', 'Details', 'info', 'I'),
  react: spec('react', 'React', 'plus'),
  delete: spec('delete', 'Delete', 'trash', 'Del'),
} as const satisfies Readonly<Record<ActionId, ActionSpec>>;

export const REACT_ACTION: ActionSpec = SPECS.react;

function pick(...ids: readonly (ActionId | false)[]): readonly ActionSpec[] {
  return ids.filter((id): id is ActionId => id !== false).map((id) => SPECS[id]);
}

function dialogueOf(context: ActionContext): boolean {
  return context.groupDialogue !== undefined || context.helperInput === true;
}

function quoteOf(context: ActionContext): readonly ActionSpec[] {
  if (context.speaker === 'system') return [];
  const reply = dialogueOf(context) && context.canReplyToHelper === true;
  return [reply ? { ...SPECS.quote, label: 'Reply' } : SPECS.quote];
}

function ownsTurn({ speaker }: ActionContext): boolean {
  return speaker === 'me' || speaker === 'ai';
}

function leadOf(context: ActionContext): readonly ActionSpec[] {
  const { speaker, hasText, canEdit, canMention, canRetry } = context;
  const dialogue = dialogueOf(context);
  return [
    ...quoteOf(context),
    ...pick(
      hasText && 'copy',
      speaker === 'me' && canEdit && !dialogue && 'edit',
      hasText && 'select',
      speaker !== 'me' && canMention && 'mention',
      canRetry && !dialogue && 'retry',
    ),
  ];
}

function sharesMedia({ hasMedia, canShareMedia }: ActionContext): boolean {
  return hasMedia && canShareMedia;
}

function mediaOf(context: ActionContext): readonly ActionSpec[] {
  return pick(context.hasMedia && 'save', sharesMedia(context) && 'share');
}

function pointerCopies({ speaker, hasText, pointer }: ActionContext): readonly ActionSpec[] {
  if (!hasText || !pointer) return [];
  return pick(speaker === 'ai' && 'copy-plain', 'copy-link');
}

function moreOf(context: ActionContext): readonly ActionSpec[] {
  const { hasText, pointer } = context;
  return [
    ...pick(
      hasText && !pointer && !sharesMedia(context) && 'share',
      ownsTurn(context) && !dialogueOf(context) && 'branch',
    ),
    ...pointerCopies(context),
  ];
}

function tailOf(context: ActionContext): readonly ActionSpec[] {
  const own = ownsTurn(context);
  return pick(
    own && context.groupDialogue === undefined && 'details',
    (own || context.groupDialogue === 'from_helper') && 'delete',
  );
}

export function actionPlan(context: ActionContext): ActionPlan {
  return {
    reactions: context.canReact,
    list: [...leadOf(context), ...mediaOf(context), ...moreOf(context), ...tailOf(context)],
  };
}

const MUTATIONS: ReadonlySet<ActionId> = new Set([
  'quote',
  'mention',
  'retry',
  'edit',
  'branch',
  'react',
  'delete',
]);

export function readablePlan(plan: ActionPlan, readOnly: boolean): ActionPlan {
  if (!readOnly) return plan;
  return {
    reactions: false,
    list: plan.list.filter((action) => !MUTATIONS.has(action.id)),
  };
}

export function mentionText(draft: string, name: string): string {
  const token = `@${name} `;
  if (draft === '') return token;
  return /\s$/u.test(draft) ? `${draft}${token}` : `${draft} ${token}`;
}

const CHAT_ID = z.uuid();

const HELPER_PREFIX = 'helper:';

export function participantChatId(participantId: string): string | null {
  if (!participantId.startsWith(HELPER_PREFIX)) return null;
  const parsed = CHAT_ID.safeParse(participantId.slice(HELPER_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

export function lastMessageOf(
  rows: Iterable<AssistantMessageRow>,
  chatId: string,
  participantId: string,
  cast: Cast,
): AssistantMessageRow | null {
  let found: AssistantMessageRow | null = null;
  for (const row of rows) {
    if (row.chat_id !== chatId || row.text.trim() === '') continue;
    if (found !== null && row.created_at <= found.created_at) continue;
    const participant = participantOf(row, speakerOf(row, cast.assistant.name), cast);
    if (participant?.id === participantId) found = row;
  }
  return found;
}
