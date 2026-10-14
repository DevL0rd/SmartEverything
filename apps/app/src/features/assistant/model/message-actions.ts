import type { IconName } from '../../../components/icon';
import type { MessageSpeaker } from './speaker';

export type ActionId =
  | 'copy'
  | 'copy-plain'
  | 'quote'
  | 'regenerate'
  | 'edit'
  | 'retry'
  | 'branch'
  | 'select'
  | 'share'
  | 'copy-link'
  | 'details'
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
  readonly canRegenerate: boolean;
  readonly canRetry: boolean;
  readonly canEdit: boolean;
  readonly pointer: boolean;
}

export interface ActionPlan {
  readonly quick: readonly ActionSpec[];
  readonly list: readonly ActionSpec[];
}

function spec(
  id: ActionId,
  label: string,
  icon: IconName,
  shortcut: string | null = null,
): ActionSpec {
  return { id, label, icon, destructive: id === 'delete', shortcut };
}

const SPECS = {
  copy: spec('copy', 'Copy', 'copy', 'C'),
  'copy-plain': spec('copy-plain', 'Copy as plain text', 'fileText', '⇧C'),
  quote: spec('quote', 'Quote', 'reply', 'Q'),
  regenerate: spec('regenerate', 'Regenerate', 'refresh', 'R'),
  edit: spec('edit', 'Edit', 'pencil', 'E'),
  retry: spec('retry', 'Try again', 'refresh', 'R'),
  branch: spec('branch', 'Branch from here', 'gitBranch', 'B'),
  select: spec('select', 'Select text', 'textCursor'),
  share: spec('share', 'Share…', 'share'),
  'copy-link': spec('copy-link', 'Copy link to message', 'link'),
  details: spec('details', 'Details', 'info', 'I'),
  delete: spec('delete', 'Delete', 'trash', 'Del'),
} as const satisfies Readonly<Record<ActionId, ActionSpec>>;

function pick(...ids: readonly (ActionId | false)[]): readonly ActionSpec[] {
  return ids.filter((id): id is ActionId => id !== false).map((id) => SPECS[id]);
}

function aiQuick(context: ActionContext): readonly ActionSpec[] {
  const { hasText, canRegenerate } = context;
  return pick(hasText && 'copy', 'quote', canRegenerate && 'regenerate', 'branch');
}

function ownQuick(context: ActionContext): readonly ActionSpec[] {
  const { hasText, canRetry, canEdit, pointer } = context;
  return canRetry
    ? pick('retry', canEdit && 'edit', hasText && 'copy', 'quote', pointer && !canEdit && 'branch')
    : pick(hasText && 'copy', 'quote', canEdit && 'edit', 'branch');
}

function quickOf(context: ActionContext): readonly ActionSpec[] {
  switch (context.speaker) {
    case 'ai':
      return aiQuick(context);
    case 'me':
      return ownQuick(context);
    case 'person':
      return pick(context.hasText && 'copy', 'quote');
    case 'system':
      return pick(context.hasText && 'copy');
  }
}

function listOf(context: ActionContext): readonly ActionSpec[] {
  const { speaker, hasText, pointer } = context;
  const own = speaker === 'me' || speaker === 'ai';
  return pick(
    hasText && 'select',
    hasText && speaker === 'ai' && 'copy-plain',
    hasText && (pointer ? 'copy-link' : 'share'),
    own && 'details',
    own && 'delete',
  );
}

export function actionPlan(context: ActionContext): ActionPlan {
  return {
    quick: quickOf(context),
    list: listOf(context),
  };
}
