import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { AssistantAttachment, ImageOperationReceipt } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { notify } from '../../../../components/toast-store';
import { errorText } from '../../../../format/errors';
import { clock } from '../../../../format/time';
import { ActivityAnnouncement } from '../../components/activity-announcement';
import { Attachments } from '../../components/attachments';
import { setDraft } from '../../data/drafts';
import type { MessageItem } from '../../data/thread';
import { useImageActions } from '../data/image-queries';
import { useImageRetry } from '../data/image-retry';
import {
  isGenerating,
  noticeLineOf,
  takenSeconds,
  type ImageLineAction,
  type ImageNoticeLine,
} from '../model/image-generation';
import { imageReceiptStatus } from '../model/image-receipt';
import type { ImageOperationItem } from '../model/image-thread';
import { ActionGroup, PromptLine, TextAction } from './image-details';
import { GenerationFrame, useKeptPreview, type KeptPreview } from './generation-frame';
import { ImageRevealProvider, type ImageReveal } from './image-result-context';

function revealOf(receipt: ImageOperationReceipt, kept: KeptPreview | null): ImageReveal | null {
  if (kept === null || receipt.results.length === 0) return null;
  return {
    preview: kept.current,
    seen: kept.seen,
    attachmentIds: new Set(receipt.results.map((result) => result.attachment.id)),
  };
}

export function ImageOperationBubble({
  item,
  flash,
  renderMessage,
  announce = true,
}: {
  readonly item: ImageOperationItem;
  readonly flash: boolean;
  readonly renderMessage: (item: MessageItem, flash: boolean) => ReactNode;
  readonly announce?: boolean;
}): ReactNode {
  const { receipt, message } = item;
  const status = imageReceiptStatus(receipt);
  const kept = useKeptPreview(receipt.id);
  const notice = noticeLineOf(receipt);
  const actions = useReceiptActions(receipt);
  const column = item.group ? 'pl-8' : undefined;
  return (
    <View className="gap-1.5">
      {announce ? (
        <ActivityAnnouncement
          status={status}
          text={status}
          announceOnMount={isGenerating(receipt)}
        />
      ) : null}
      <ImageRevealProvider reveal={revealOf(receipt, kept)}>
        {message === null ? (
          <View {...(column === undefined ? {} : { className: column })}>
            <ReceiptBody receipt={receipt} kept={kept} />
          </View>
        ) : (
          renderMessage(message, flash)
        )}
      </ImageRevealProvider>
      <View {...(column === undefined ? {} : { className: column })}>
        {notice === null ? (
          <PromptLine
            receipt={receipt}
            attachments={message?.row.attachments}
            actions={<PromptActions receipt={receipt} actions={actions} />}
          />
        ) : (
          <NoticeLine receipt={receipt} notice={notice} actions={actions} />
        )}
      </View>
    </View>
  );
}

function ReceiptBody({
  receipt,
  kept,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly kept: KeptPreview | null;
}): ReactNode {
  if (receipt.results.length > 0) {
    const attachments: readonly AssistantAttachment[] = receipt.results.map(
      (result) => result.attachment,
    );
    return <Attachments attachments={attachments} chatId={receipt.chat_id} />;
  }
  return isGenerating(receipt) ? <GenerationFrame receipt={receipt} kept={kept} /> : null;
}

type Pending = 'cancel' | 'read' | 'retry';

interface ReceiptActions {
  readonly pending: Pending | null;
  readonly requested: boolean;
  readonly run: (action: Pending) => void;
}

const FAILURE: Readonly<Record<Pending, string | null>> = {
  cancel: 'Cancellation could not be confirmed. Refresh to see the status.',
  read: null,
  retry: 'The image request could not start again.',
};

function useReceiptActions(receipt: ImageOperationReceipt): ReceiptActions {
  const actions = useImageActions();
  const retry = useImageRetry();
  const locked = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [requested, setRequested] = useState(false);
  const perform = async (action: Pending): Promise<void> => {
    if (action === 'retry') return retry(receipt);
    const confirmed =
      action === 'cancel' ? await actions.cancel(receipt.id) : await actions.read(receipt.id);
    setRequested(confirmed.cancellation_requested);
  };
  const request = async (action: Pending): Promise<void> => {
    if (locked.current) return;
    locked.current = true;
    setPending(action);
    if (action === 'cancel') setRequested(true);
    try {
      await perform(action);
    } catch (error) {
      notify({ message: FAILURE[action] ?? errorText(error).title, tone: 'critical' });
    } finally {
      setPending(null);
      locked.current = false;
    }
  };
  return {
    pending,
    requested: requested || receipt.cancellation_requested,
    run: (action): void => {
      background(request(action), 'image_receipts.request_failed');
    },
  };
}

function PromptActions({
  receipt,
  actions,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly actions: ReceiptActions;
}): ReactNode {
  const { pending, requested, run } = actions;
  if (!isGenerating(receipt))
    return (
      <ActionGroup>
        {[
          <TextAction
            key="again"
            label={pending === 'retry' ? 'Starting…' : 'Again'}
            disabled={pending !== null}
            onPress={() => {
              run('retry');
            }}
          />,
        ]}
      </ActionGroup>
    );
  return (
    <ActionGroup>
      {[
        <TextAction
          key="cancel"
          label={requested ? 'Cancelling…' : 'Cancel'}
          disabled={pending !== null || requested}
          onPress={() => {
            run('cancel');
          }}
        />,
        <TextAction
          key="refresh"
          label="Refresh"
          disabled={pending !== null}
          onPress={() => {
            run('read');
          }}
        />,
      ]}
    </ActionGroup>
  );
}

const LINE_ICON = { critical: 'alert', warning: 'warning', variant: 'clock' } as const;

function lineAction(
  action: ImageLineAction,
  receipt: ImageOperationReceipt,
  { pending, run }: ReceiptActions,
): ReactNode {
  switch (action) {
    case 'edit':
      return (
        <TextAction
          key="edit"
          label="Edit prompt"
          primary
          onPress={() => {
            setDraft(receipt.chat_id, receipt.request.prompt);
          }}
        />
      );
    case 'retry':
      return (
        <TextAction
          key="retry"
          label={pending === 'retry' ? 'Starting…' : 'Retry'}
          disabled={pending !== null}
          onPress={() => {
            run('retry');
          }}
        />
      );
    case 'check':
      return (
        <TextAction
          key="refresh"
          label="Refresh"
          disabled={pending !== null}
          onPress={() => {
            run('read');
          }}
        />
      );
  }
}

function NoticeLine({
  receipt,
  notice,
  actions,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly notice: ImageNoticeLine;
  readonly actions: ReceiptActions;
}): ReactNode {
  return (
    <View
      accessibilityRole={notice.tone === 'critical' ? 'alert' : undefined}
      className="flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5"
    >
      <Icon name={LINE_ICON[notice.tone]} size={16} tone={notice.tone} />
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {notice.text}
      </Text>
      <View className="grow flex-row items-center gap-1.5">
        <ActionGroup>
          {notice.actions.map((action) => lineAction(action, receipt, actions))}
        </ActionGroup>
        <Text variant="caption" tone="faint" numberOfLines={1} className="ml-auto tabular-nums">
          {`${clock(receipt.updated_at)} · ${String(takenSeconds(receipt))} s`}
        </Text>
      </View>
    </View>
  );
}
