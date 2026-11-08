import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantAttachment, ImageOperationReceipt } from '@smarteverything/domain';
import { CollapseBody, CollapseRoot } from '../../../../components/disclosure';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { useRows } from '../../../../store/selectors';
import { useMoney } from '../../../region/data/use-money';
import { CHAT_SURFACE } from '../../components/chat-surface';
import { detailRows, promptLine, type DetailRow } from '../model/image-generation';

export function TextAction({
  label,
  onPress,
  disabled = false,
  primary = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className="shrink-0 rounded-sm"
    >
      <Text
        variant="footnote"
        tone={disabled ? 'faint' : primary ? 'primary' : 'default'}
        numberOfLines={1}
        className="font-sans-medium"
      >
        {label}
      </Text>
    </Interactive>
  );
}

export function ActionGroup({ children }: { readonly children: readonly ReactNode[] }): ReactNode {
  return (
    <View className="shrink-0 flex-row items-center gap-1.5">
      {children.flatMap((child, index) =>
        index === 0
          ? [child]
          : [
              <Text key={`sep-${String(index)}`} variant="footnote" tone="faint" aria-hidden>
                ·
              </Text>,
              child,
            ],
      )}
    </View>
  );
}

function DetailLine({ row }: { readonly row: DetailRow }): ReactNode {
  return (
    <View className="flex-row items-start gap-3 py-1.5">
      <Text variant="footnote" tone="variant" className="w-24 shrink-0">
        {row.label}
      </Text>
      <Text
        variant="footnote"
        align="end"
        selectable
        className={cn('min-w-0 flex-1', row.figure && 'tabular-nums')}
      >
        {row.value}
      </Text>
    </View>
  );
}

function descriptionOf(image: AssistantAttachment): string {
  const transcript = image.transcript?.trim();
  return transcript === undefined || transcript === '' || transcript === '(no description)'
    ? 'Description unavailable.'
    : transcript;
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
  return images.map((image, index) => (
    <DetailLine
      key={image.id}
      row={{
        label: images.length > 1 ? `Image ${String(index + 1)}` : 'Description',
        value: descriptionOf(loaded.find((attachment) => attachment.id === image.id) ?? image),
        figure: false,
      }}
    />
  ));
}

function DetailsPanel({
  receipt,
  attachments,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly attachments: readonly AssistantAttachment[] | undefined;
}): ReactNode {
  const { dollars } = useMoney();
  return (
    <View className={cn(CHAT_SURFACE, 'mt-1.5 px-3 py-1')}>
      {detailRows(receipt, dollars).map((row) => (
        <DetailLine key={row.label} row={row} />
      ))}
      <ImageDescriptions receipt={receipt} attachments={attachments} />
    </View>
  );
}

export function PromptLine({
  receipt,
  attachments,
  actions,
}: {
  readonly receipt: ImageOperationReceipt;
  readonly attachments: readonly AssistantAttachment[] | undefined;
  readonly actions: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <CollapseRoot>
      <View className="flex-row items-center gap-2">
        <Interactive
          label={open ? 'Hide image details' : 'Show image details'}
          expanded={open}
          onPress={() => {
            setOpen(!open);
          }}
          className="min-w-0 flex-1 flex-row items-center gap-1.5 rounded-sm"
        >
          <Icon name="wand" size={16} tone="faint" />
          <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {promptLine(receipt)}
          </Text>
        </Interactive>
        {actions}
      </View>
      {open ? (
        <CollapseBody>
          <DetailsPanel receipt={receipt} attachments={attachments} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
