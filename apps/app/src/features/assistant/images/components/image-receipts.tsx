import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import type { AssistantAttachment, ImageOperationReceipt } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { ImagePlaceholder } from '../../../../components/image-placeholder';
import { Interactive } from '../../../../components/interactive';
import { notify } from '../../../../components/toast-store';
import { useRows } from '../../../../store/selectors';
import { errorText } from '../../../../format/errors';
import { Attachments } from '../../components/attachments';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../../components/disclosure';
import type { MessageItem } from '../../data/thread';
import { useImageActions, useImagePreview } from '../data/image-queries';
import { imageReceiptStatus } from '../model/image-receipt';
import { pendingImageFrame, type ImageOperationItem } from '../model/image-thread';
import { background } from '@smarteverything/logging';

function PendingImage({ receipt }: { readonly receipt: ImageOperationReceipt }): ReactNode {
  const preview = useImagePreview(receipt.id);
  const active = receipt.state === 'reserved' || receipt.state === 'running';
  return (
    <View
      style={pendingImageFrame(receipt)}
      accessibilityLabel={imageReceiptStatus(receipt)}
      className="max-w-full overflow-hidden rounded-xl border-hairline border-outline-variant"
    >
      <ImagePlaceholder active={active} />
      {preview === null || !active ? null : (
        <Image
          source={{ uri: `data:${preview.mime};base64,${preview.data}` }}
          resizeMode="contain"
          accessibilityLabel="Intermediate image preview, not saved"
          className="size-full"
        />
      )}
    </View>
  );
}

export function ImageOperationBubble({
  item,
  flash,
  renderMessage,
}: {
  readonly item: ImageOperationItem;
  readonly flash: boolean;
  readonly renderMessage: (item: MessageItem, flash: boolean) => ReactNode;
}): ReactNode {
  const { receipt, message } = item;
  return (
    <View className="gap-2">
      {message === null ? (
        <View className="gap-2">
          {receipt.results.length > 0 ? (
            <Attachments
              attachments={receipt.results.map((result) => result.attachment)}
              chatId={receipt.chat_id}
            />
          ) : ['reserved', 'running'].includes(receipt.state) ? (
            <PendingImage receipt={receipt} />
          ) : null}
          <Text variant="label" accessibilityLiveRegion="polite">
            {imageReceiptStatus(receipt)}
          </Text>
          <Text variant="caption" tone="variant">
            {receipt.endpoint.name}
          </Text>
          <TerminalImageNotice receipt={receipt} />
          {receipt.reason === null ? null : (
            <Text variant="footnote" tone={receipt.state === 'failed' ? 'critical' : 'variant'}>
              {receipt.reason}
            </Text>
          )}
        </View>
      ) : (
        renderMessage(message, flash)
      )}
      {receipt.state === 'completed' ||
      (message !== null && ['reserved', 'running'].includes(receipt.state)) ? null : (
        <ReceiptActions receipt={receipt} />
      )}
      <ReceiptDetails receipt={receipt} attachments={message?.row.attachments} />
    </View>
  );
}

function ReceiptDetails({
  receipt,
  attachments,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly attachments?: readonly AssistantAttachment[] | undefined;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot>
      <Interactive
        label={open ? 'Hide image details' : 'Show image details'}
        checked={open}
        onPress={() => {
          setOpen(!open);
        }}
        className="min-h-touch-min flex-row items-center gap-2 self-start rounded-sm px-1"
      >
        <Text variant="footnote" tone="variant">
          Details
        </Text>
        <TurnChevron open={open} />
      </Interactive>
      {open ? (
        <CollapseBody className="gap-3 border-t border-outline-variant px-1 pb-2 pt-3">
          <View className="gap-1">
            <Text variant="caption" tone="variant">
              Description
            </Text>
            <ImageDescriptions receipt={receipt} attachments={attachments} />
          </View>
          <View className="gap-1">
            <Text variant="caption" tone="variant">
              Prompt
            </Text>
            <Text variant="footnote" selectable>
              {receipt.request.prompt}
            </Text>
          </View>
          {receipt.state === 'completed' ? <ReceiptActions receipt={receipt} /> : null}
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}

function ImageDescriptions({
  receipt,
  attachments,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly attachments: readonly AssistantAttachment[] | undefined;
}): ReactNode {
  const rows = useRows('assistant_messages');
  const images = attachments ?? receipt.results.map((result) => result.attachment);
  const loaded = rows
    .filter((row) => row.chat_id === receipt.chat_id)
    .flatMap((row) => row.attachments);
  if (images.length === 0)
    return (
      <Text variant="footnote" tone="variant">
        No saved image to describe.
      </Text>
    );
  return images.map((image) => {
    const current = loaded.find((attachment) => attachment.id === image.id) ?? image;
    const transcript = current.transcript?.trim();
    const available =
      transcript !== undefined && transcript !== '' && transcript !== '(no description)';
    return (
      <View key={image.id} className="gap-1">
        {images.length > 1 ? (
          <Text variant="caption" tone="variant">
            {image.name}
          </Text>
        ) : null}
        <Text variant="footnote" tone={available ? 'default' : 'variant'} selectable={available}>
          {available ? transcript : 'Description unavailable.'}
        </Text>
      </View>
    );
  });
}

function TerminalImageNotice({ receipt }: { readonly receipt: ImageOperationReceipt }): ReactNode {
  if (receipt.results.length > 0) return null;
  if (receipt.state !== 'unknown' && receipt.state !== 'failed') return null;
  return (
    <Text variant="footnote" tone={receipt.state === 'failed' ? 'critical' : 'warning'}>
      {receipt.state === 'failed'
        ? 'The image request could not finish. No result was saved.'
        : 'The image request stopped. Nothing was saved. You may still be charged; check Costs before trying again.'}
    </Text>
  );
}

function useReceiptActions(receipt: ImageOperationReceipt): {
  readonly pending: 'cancel' | 'read' | null;
  readonly requested: boolean;
  readonly request: (cancel: boolean) => Promise<void>;
} {
  const actions = useImageActions();
  const locked = useRef(false);
  const [pending, setPending] = useState<'cancel' | 'read' | null>(null);
  const [requested, setRequested] = useState(false);
  const request = async (cancel: boolean): Promise<void> => {
    if (locked.current) return;
    locked.current = true;
    setPending(cancel ? 'cancel' : 'read');
    if (cancel) setRequested(true);
    try {
      const confirmed = cancel ? await actions.cancel(receipt.id) : await actions.read(receipt.id);
      setRequested(confirmed.cancellation_requested);
    } catch (error) {
      notify({
        message: cancel
          ? 'Cancellation could not be confirmed. Check receipt.'
          : errorText(error).title,
        tone: 'critical',
      });
    } finally {
      setPending(null);
      locked.current = false;
    }
  };
  return { pending, requested: requested || receipt.cancellation_requested, request };
}

function ReceiptActions({ receipt }: { readonly receipt: ImageOperationReceipt }): ReactNode {
  const { pending, requested, request } = useReceiptActions(receipt);
  const active = ['running', 'reserved'].includes(receipt.state);
  return (
    <View className="gap-1">
      {requested && active ? (
        <Text variant="footnote" accessibilityLiveRegion="polite" tone="variant">
          Cancellation requested · waiting for confirmation
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {active ? (
          <Button
            label="Cancel operation"
            variant="outlined"
            loading={pending === 'cancel'}
            disabled={pending !== null || requested}
            onPress={() => {
              background(request(true), 'image_receipts.request_failed');
            }}
          />
        ) : null}
        {active || receipt.state === 'unknown' ? (
          <Button
            label="Check receipt"
            variant="text"
            loading={pending === 'read'}
            disabled={pending !== null}
            onPress={() => {
              background(request(false), 'image_receipts.request_failed');
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
