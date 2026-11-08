import {
  canReactToMessage,
  helperDialogueOf,
  isHelperDialogueMessage,
  type AssistantAttachment,
  type AssistantMessageRow,
  type HelperDialogue,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useActiveProfile } from '../../../store/people';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { Share, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import { createURL } from 'expo-linking';
import { router } from 'expo-router';
import { assistantAttachmentLinks } from '../../../api/assistant';
import { href } from '../../../app-shell/hrefs';
import { copyText } from '../../../components/copy-button';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { canShareFiles, downloadFile, shareFile } from '../../../platform/file-actions';
import { draftText, quoteInto, setDraft, setReferenceDraft } from '../data/drafts';
import { startEditing } from '../data/editing';
import { deleteMessageWithUndo } from '../data/message-delete';
import { useCanContinue, useRowActionState } from '../data/retry';
import { branchFromMessage, continueMessage } from '../data/send';
import { endsMessage, type MessageItem } from '../data/thread';
import { replyableHelperId } from '../model/helper-target';
import {
  REACT_ACTION,
  actionPlan,
  mentionText,
  readablePlan,
  type ActionId,
  type ActionPlan,
  type ActionSpec,
} from '../model/message-actions';
import { readableText } from '@smarteverything/domain/markdown';
import { useMessageActionSurfaces } from './message-action-surfaces';
import { background } from '@smarteverything/logging';

export interface MessageActions {
  readonly header: ((close: () => void) => ReactNode) | null;
  readonly list: readonly MenuItem[];
  readonly run: (id: ActionId) => void;
  readonly openDetails: () => void;
  readonly host: ReactNode;
  readonly reactionFooter: (align: 'start' | 'end') => ReactNode;
  readonly accessibility: {
    readonly accessibilityActions: readonly AccessibilityActionInfo[];
    readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
  };
}

async function branch(item: MessageItem): Promise<void> {
  const created = await branchFromMessage(item.row);
  if (created === null) {
    return;
  }
  if (item.speaker.kind === 'me') {
    setReferenceDraft(created.id, { text: item.row.text, references: item.row.references ?? [] });
  }
  router.push(href.assistantChat(created.id));
}

async function shareText(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch (error) {
    notify({ message: 'Message not shared', error, tone: 'critical' });
  }
}

async function withLinks(
  attachments: readonly AssistantAttachment[],
  run: (url: string, name: string) => void,
): Promise<void> {
  const links = await assistantAttachmentLinks(attachments.map(({ id }) => id));
  for (const attachment of attachments) {
    const link = links[attachment.id];
    if (link === undefined) {
      notify({ message: `${attachment.name} is not available`, tone: 'critical' });
    } else {
      run(link.url, attachment.name);
    }
  }
}

export function mentionInto(chatId: string, name: string): void {
  setDraft(chatId, mentionText(draftText(chatId), name));
}

function menuItem(
  spec: ActionSpec,
  run: (id: ActionId) => void,
  pointer: boolean,
  subpage: MenuItem['subpage'],
): MenuItem {
  return {
    id: spec.id,
    label: spec.id === 'branch' && !pointer ? 'Branch' : spec.label,
    icon: spec.icon,
    destructive: spec.destructive,
    onPress: (): void => {
      run(spec.id);
    },
    ...(subpage === undefined ? {} : { subpage }),
    ...(pointer && spec.shortcut !== null ? { shortcut: spec.shortcut } : {}),
  };
}

interface Controls {
  readonly select: () => void;
  readonly react: () => void;
  readonly details: () => void;
  readonly retry: () => void;
  readonly helperChatId: string | undefined;
}

function quoteWho(item: MessageItem): string {
  return item.speaker.kind === 'me' ? 'You' : item.speaker.name;
}

function quoteOf(item: MessageItem, helperChatId: string | undefined): () => void {
  const { row } = item;
  return (): void => {
    quoteInto(row.chat_id, {
      messageId: row.id,
      who: quoteWho(item),
      text: readableText(row.text),
      ...(helperChatId === undefined ? {} : { helperChatId }),
    });
  };
}

export function sharesOneFile(row: Pick<AssistantMessageRow, 'attachments'>): boolean {
  return row.attachments.length === 1 && canShareFiles();
}

function shareOf(row: AssistantMessageRow): () => void {
  return (): void => {
    const media = sharesOneFile(row);
    background(
      media ? withLinks(row.attachments, shareFile) : shareText(readableText(row.text)),
      'message_actions.share_failed',
    );
  };
}

function textHandlers(
  row: AssistantMessageRow,
): Pick<Readonly<Record<ActionId, () => void>>, 'copy' | 'copy-plain' | 'copy-link'> {
  return {
    copy: (): void => {
      copyText(row.text, 'Message');
    },
    'copy-plain': (): void => {
      copyText(readableText(row.text), 'Text');
    },
    'copy-link': (): void => {
      const link = createURL(`/assistant/chat/${row.chat_id}`, {
        queryParams: { message: row.id },
      });
      copyText(link, 'Link');
    },
  };
}

function handlersOf(item: MessageItem, controls: Controls): Readonly<Record<ActionId, () => void>> {
  const { row } = item;
  return {
    ...textHandlers(row),
    quote: quoteOf(item, controls.helperChatId),
    mention: (): void => {
      if (item.participant !== null) mentionInto(row.chat_id, item.participant.name);
    },
    retry: controls.retry,
    edit: (): void => {
      startEditing(row.id);
    },
    save: (): void => {
      background(withLinks(row.attachments, downloadFile), 'message_actions.save_failed');
    },
    share: shareOf(row),
    branch: (): void => {
      background(branch(item), 'message_actions.branch_failed');
    },
    select: controls.select,
    details: controls.details,
    react: controls.react,
    delete: (): void => {
      deleteMessageWithUndo(row);
    },
  };
}

function useReplyableHelper(
  row: AssistantMessageRow,
  dialogue: HelperDialogue | undefined,
): string | undefined {
  const targetId = dialogue?.direction === 'from_helper' ? dialogue.helper_chat_id : null;
  return useStoreSelector(
    (state) => {
      if (targetId === null) return undefined;
      const target = state.tables.ai_chats.byId[targetId] ?? null;
      return replyableHelperId(row, target, state.session?.client.role === 'owner');
    },
    sameJson,
    [targetId, row.id, row.chat_id, row.profile_id],
  );
}

interface PlanInput {
  readonly item: MessageItem;
  readonly canReact: boolean;
  readonly groupDialogue: HelperDialogue['direction'] | undefined;
  readonly canReplyToHelper: boolean;
}

function useRetry(row: AssistantMessageRow): (() => void) | null {
  const { request } = useRowActionState(row);
  const continuable = useCanContinue(request);
  if (request === null || !continuable) return null;
  return (): void => {
    background(continueMessage(request), 'message.continue_failed');
  };
}

function canMention({ group, participant }: MessageItem): boolean {
  return group && participant !== null && participant.kind !== 'me';
}

function useActionPlan(input: PlanInput, canRetry: boolean): ActionPlan {
  const { item, canReact, groupDialogue, canReplyToHelper } = input;
  const { row, speaker } = item;
  const pointer = useIdiom() === 'pointer';
  const { canEdit, readOnly } = useRowActionState(row);
  const plan = actionPlan({
    speaker: speaker.kind,
    hasText: row.text.trim() !== '',
    hasMedia: row.attachments.length > 0,
    canShareMedia: sharesOneFile(row),
    canEdit,
    canRetry,
    canReact,
    canMention: canMention(item),
    pointer,
    canReplyToHelper,
    ...(groupDialogue === undefined ? {} : { groupDialogue }),
    helperInput: groupDialogue === undefined && isHelperDialogueMessage(row),
  });
  return readablePlan(plan, readOnly);
}

function accessibilityOf(
  specs: readonly ActionSpec[],
  run: (id: ActionId) => void,
): MessageActions['accessibility'] {
  return {
    accessibilityActions: specs.map((spec) => ({ name: spec.id, label: spec.label })),
    onAccessibilityAction: (event): void => {
      const spec = specs.find((candidate) => candidate.id === event.nativeEvent.actionName);
      if (spec !== undefined) {
        run(spec.id);
      }
    },
  };
}

function useCanReact(item: MessageItem): boolean {
  const profile = useActiveProfile();
  const { row } = item;
  return (
    endsMessage(item) &&
    profile?.id === row.profile_id &&
    row.reactions !== undefined &&
    canReactToMessage(row)
  );
}

export function useMessageActions(item: MessageItem): MessageActions {
  const pointer = useIdiom() === 'pointer';
  const profile = useActiveProfile();
  const { row } = item;
  const dialogue = helperDialogueOf(row);
  const helperChatId = useReplyableHelper(row, dialogue);
  const retry = useRetry(row);
  const plan = useActionPlan(
    {
      item,
      canReact: useCanReact(item),
      groupDialogue: dialogue?.direction,
      canReplyToHelper: helperChatId !== undefined,
    },
    retry !== null,
  );
  const surfaces = useMessageActionSurfaces({
    row,
    speakerName: item.speaker.name,
    profileId: endsMessage(item) ? (profile?.id ?? null) : null,
    enabled: plan.reactions,
    onAsk: (excerpt): void => {
      quoteInto(row.chat_id, { messageId: row.id, who: quoteWho(item), text: excerpt });
    },
  });
  const specs = plan.reactions ? [REACT_ACTION, ...plan.list] : plan.list;
  const handlers = handlersOf(item, {
    ...surfaces,
    helperChatId,
    retry: (): void => {
      retry?.();
    },
  });
  const run = (id: ActionId): void => {
    if (specs.some((spec) => spec.id === id)) handlers[id]();
  };
  return {
    header: plan.reactions ? surfaces.quickReactions : null,
    list: plan.list.map((spec) => menuItem(spec, run, pointer, surfaces.subpages[spec.id])),
    run,
    openDetails: surfaces.details,
    reactionFooter: surfaces.reactionFooter,
    host: surfaces.host,
    accessibility: accessibilityOf(specs, run),
  };
}
