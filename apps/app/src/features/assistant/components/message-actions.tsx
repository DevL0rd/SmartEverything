import type { ReactNode } from 'react';
import { useState } from 'react';
import { Share, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import { createURL } from 'expo-linking';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { copyText } from '../../../components/copy-button';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { useRow } from '../../../store/selectors';
import { quoteInto, setDraft } from '../data/drafts';
import { startEditing } from '../data/editing';
import { deleteMessageWithUndo } from '../data/pending-deletes';
import { useCanEdit, useRetryFrom } from '../data/retry';
import { branchFromMessage, retryMessage } from '../data/send';
import type { MessageItem } from '../data/thread';
import {
  actionPlan,
  type ActionId,
  type ActionPlan,
  type ActionSpec,
} from '../model/message-actions';
import { readableText } from './markdown/parse';
import { MessageDetails } from './message-details';
import { SelectTextSheet } from './select-text-sheet';

export interface MessageActions {
  readonly plan: ActionPlan;
  readonly quick: readonly MenuItem[];
  readonly list: readonly MenuItem[];
  readonly run: (id: ActionId) => void;
  readonly openDetails: () => void;
  readonly host: ReactNode;
  readonly accessibility: {
    readonly accessibilityActions: readonly AccessibilityActionInfo[];
    readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
  };
}

interface SheetFlag {
  readonly open: boolean;
  readonly mounted: boolean;
  readonly show: () => void;
  readonly hide: () => void;
}

function useSheetFlag(): SheetFlag {
  const [state, setState] = useState({ open: false, mounted: false });
  return {
    open: state.open,
    mounted: state.mounted,
    show: (): void => {
      setState({ open: true, mounted: true });
    },
    hide: (): void => {
      setState((current) => ({ ...current, open: false }));
    },
  };
}

async function branch(item: MessageItem): Promise<void> {
  const created = await branchFromMessage(item.row);
  if (created === null) {
    return;
  }
  if (item.speaker.kind === 'me') {
    setDraft(created.id, item.row.text);
  }
  router.push(href.assistantChat(created.id));
}

async function share(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch (error) {
    notify({ message: 'Message not shared', error, tone: 'critical' });
  }
}

function menuItem(spec: ActionSpec, run: (id: ActionId) => void, pointer: boolean): MenuItem {
  return {
    label: spec.id === 'branch' && !pointer ? 'Branch' : spec.label,
    icon: spec.icon,
    destructive: spec.destructive,
    onPress: (): void => {
      run(spec.id);
    },
    ...(pointer && spec.shortcut !== null ? { shortcut: spec.shortcut } : {}),
  };
}

interface Controls {
  readonly retry: (() => void) | null;
  readonly select: () => void;
  readonly details: () => void;
}

function quoteWho(item: MessageItem): string {
  return item.speaker.kind === 'me' ? 'You' : item.speaker.name;
}

function handlersOf(item: MessageItem, controls: Controls): Readonly<Record<ActionId, () => void>> {
  const { row } = item;
  const retry = (): void => {
    controls.retry?.();
  };
  return {
    copy: (): void => {
      copyText(row.text, 'Message');
    },
    'copy-plain': (): void => {
      copyText(readableText(row.text), 'Text');
    },
    quote: (): void => {
      quoteInto(row.chat_id, { who: quoteWho(item), text: readableText(row.text) });
    },
    regenerate: retry,
    retry,
    edit: (): void => {
      startEditing(row.id);
    },
    branch: (): void => {
      void branch(item);
    },
    select: controls.select,
    share: (): void => {
      void share(readableText(row.text));
    },
    'copy-link': (): void => {
      const link = createURL(`/assistant/chat/${row.chat_id}`, {
        queryParams: { message: row.id },
      });
      copyText(link, 'Link');
    },
    details: controls.details,
    delete: (): void => {
      deleteMessageWithUndo(row);
    },
  };
}

function useActionPlan(item: MessageItem): {
  readonly plan: ActionPlan;
  readonly retry: (() => void) | null;
} {
  const { row, speaker, latestReply } = item;
  const pointer = useIdiom() === 'pointer';
  const replyTo = useRow('assistant_messages', row.role === 'person' ? null : row.reply_to);
  const request = row.role === 'person' ? row : replyTo;
  const retryFrom = useRetryFrom(request);
  const canEdit = useCanEdit(row);
  const plan = actionPlan({
    speaker: speaker.kind,
    hasText: row.text.trim() !== '',
    latestReply,
    canRegenerate: speaker.kind === 'ai' && latestReply && retryFrom !== null,
    canRetry: speaker.kind === 'me' && row.state === 'failed' && retryFrom !== null,
    canEdit,
    pointer,
  });
  const retry =
    request === null || retryFrom === null
      ? null
      : (): void => {
          void retryMessage(request, retryFrom);
        };
  return { plan, retry };
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

function ActionSheets({
  item,
  details,
  selecting,
}: {
  readonly item: MessageItem;
  readonly details: SheetFlag;
  readonly selecting: SheetFlag;
}): ReactNode {
  const { row } = item;
  return (
    <>
      {details.mounted ? (
        <MessageDetails row={row} open={details.open} onClose={details.hide} />
      ) : null}
      {selecting.mounted ? (
        <SelectTextSheet
          text={readableText(row.text)}
          open={selecting.open}
          onClose={selecting.hide}
          onAsk={(excerpt) => {
            quoteInto(row.chat_id, { who: quoteWho(item), text: excerpt });
          }}
        />
      ) : null}
    </>
  );
}

export function useMessageActions(item: MessageItem): MessageActions {
  const pointer = useIdiom() === 'pointer';
  const details = useSheetFlag();
  const selecting = useSheetFlag();
  const { plan, retry } = useActionPlan(item);
  const handlers = handlersOf(item, { retry, select: selecting.show, details: details.show });
  const run = (id: ActionId): void => {
    handlers[id]();
  };
  return {
    plan,
    quick: plan.quick.map((spec) => menuItem(spec, run, pointer)),
    list: plan.list.map((spec) => menuItem(spec, run, pointer)),
    run,
    openDetails: details.show,
    host: <ActionSheets item={item} details={details} selecting={selecting} />,
    accessibility: accessibilityOf([...plan.quick, ...plan.list], run),
  };
}
