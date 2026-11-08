import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  helperDialogueOf,
  type AssistantAttachment,
  type MessageQuote,
} from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import { useStoreSelector } from '../../../store/store-context';
import { isImageAttachment } from '../data/chat-images';
import type { MessageItem, QuotedOriginal } from '../data/thread';
import type { RunPosition } from '../model/speaker';
import type { MessageActions } from './message-actions';
import { Markdown } from './markdown/markdown';
import { mentionRuleOf } from './markdown/mention-runs';
import { readableText } from '@smarteverything/domain/markdown';
import { Attachments, type AttachmentTint } from './attachments';
import { useIdiom } from '../../../design/platform';
import { QuoteStrip, quoteSourceOf } from './quote-strip';

export function useTimeZone(): string | null {
  return useStoreSelector((state) => state.settings?.time_zone ?? null);
}

export function messageLabel(item: MessageItem, timeZone: string | null): string {
  const who = item.speaker.kind === 'me' ? 'You' : item.speaker.name;
  const dialogue = helperDialogueOf(item.row);
  const addressed = dialogue?.direction === 'to_helper' ? ` to @${dialogue.helper_name}` : '';
  return `${who}${addressed}, ${clock(item.row.created_at, timeZone)}: ${readableText(item.row.text)}`;
}

export function shownText(item: MessageItem): string {
  return item.mentions === null ? item.row.text : item.mentions.map((token) => token.text).join('');
}

function BubbleQuote({
  quote,
  quoted,
}: {
  readonly quote: MessageQuote;
  readonly quoted: QuotedOriginal | null;
}): ReactNode {
  return <QuoteStrip quote={quote} source={quoteSourceOf(quote, quoted, false)} />;
}

export function ownImagesOf(item: MessageItem): readonly AssistantAttachment[] {
  return item.row.attachments.filter(isImageAttachment);
}

function bubbleFilesOf(item: MessageItem): readonly AssistantAttachment[] {
  return item.row.attachments.filter((attachment) => !isImageAttachment(attachment));
}

export function hasBubbleContent(item: MessageItem): boolean {
  return item.quote !== null || bubbleFilesOf(item).length > 0 || shownText(item) !== '';
}

export function BubbleContent({
  item,
  actions,
  tint = 'surface',
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
  readonly tint?: AttachmentTint;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const timeZone = useTimeZone();
  const { row } = item;
  const text = shownText(item);
  const files = bubbleFilesOf(item);
  return (
    <View className="gap-1.5">
      {item.quote === null ? null : <BubbleQuote quote={item.quote} quoted={item.quoted} />}
      {files.length === 0 ? null : (
        <Attachments attachments={files} chatId={row.chat_id} tint={tint} />
      )}
      {text === '' ? null : (
        <View
          accessible
          accessibilityLabel={messageLabel(item, timeZone)}
          {...actions.accessibility}
        >
          <Markdown text={text} selectable={pointer} mentions={mentionRuleOf(item.mentions)} />
        </View>
      )}
    </View>
  );
}

const OWN_TAIL: Readonly<Record<RunPosition, string>> = {
  only: 'rounded-br-tail',
  first: '',
  middle: '',
  last: 'rounded-br-tail',
};

export const OWN_FILL = 'bg-primary/16 light:bg-primary/12';

export const OWN_PADDING = 'px-3.25 py-2';

export const OWN_META_LINE = 'mt-0.75 h-4 flex-row items-center gap-1.25 self-end pr-1';

export function ownBubbleClass(position: RunPosition, belowImages = false): string {
  return cn(
    'max-w-17/20 rounded-bubble web:wrap-anywhere',
    OWN_FILL,
    belowImages && 'rounded-tr-tail',
    OWN_TAIL[position],
  );
}

export function ownImagesClass(position: RunPosition, captioned: boolean): string {
  return cn('rounded-bubble', captioned ? 'rounded-br-tail' : OWN_TAIL[position]);
}

export function MetaDot(): ReactNode {
  return (
    <Text variant="caption" tone="faint" className="opacity-60">
      ·
    </Text>
  );
}

export function MetaAction({
  text,
  label = text,
  primary = false,
  disabled = false,
  onPress,
}: {
  readonly text: string;
  readonly label?: string;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      className="h-4 justify-center"
      layerClassName="rounded-sm"
    >
      <Text variant="caption" tone={primary ? 'primary' : 'variant'} numberOfLines={1}>
        {text}
      </Text>
    </Interactive>
  );
}
