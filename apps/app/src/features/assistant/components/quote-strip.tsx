import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import {
  ASSISTANT_LEVEL_WINDOW_MS,
  type AssistantAttachment,
  type MessageQuote,
} from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { LoadedImage } from '../../../components/loaded-image';
import { barPath } from '../../../components/charts/bar-path';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { playTime } from '../../../format/time';
import type { QuotedOriginal } from '../data/thread';
import { useAttachmentLinks } from '../data/remote';
import { inkOf, type ParticipantInk } from '../model/participant';
import { INK_RAIL, INK_TEXT } from './chat-surface';

export type QuoteSource =
  | {
      readonly kind: 'shown';
      readonly name: string;
      readonly ink: ParticipantInk;
      readonly attachment: AssistantAttachment | null;
    }
  | { readonly kind: 'deleted' };

const WAVE = { width: 30, bar: 2, gap: 1, height: 18, floor: 3, opacity: 0.6 } as const;

const OWN_NAME = 'You';

export function quoteSourceOf(
  quote: MessageQuote,
  original: QuotedOriginal | null,
  removed: boolean,
): QuoteSource {
  if (removed) return { kind: 'deleted' };
  const participant = original?.participant ?? null;
  if (original === null || participant === null) {
    return { kind: 'shown', name: quote.author, ink: inkOf(quote.author), attachment: null };
  }
  return {
    kind: 'shown',
    name: participant.kind === 'me' ? OWN_NAME : participant.name,
    ink: participant.ink,
    attachment: original.row.attachments[0] ?? null,
  };
}

function voiceSeconds(attachment: AssistantAttachment | null): number | null {
  const levels = attachment?.levels;
  return levels === undefined || levels === null || levels.length === 0
    ? null
    : (levels.length * ASSISTANT_LEVEL_WINDOW_MS) / 1000;
}

export function quoteLine(quote: MessageQuote, attachment: AssistantAttachment | null): string {
  switch (quote.media_kind) {
    case 'image':
      return joinParts(['Photo', quote.excerpt]);
    case 'voice': {
      const seconds = voiceSeconds(attachment);
      return joinParts(['Voice', seconds === null ? quote.excerpt : playTime(seconds)]);
    }
    case 'file':
      if (attachment !== null) return joinParts([attachment.name, bytes(attachment.bytes)]);
      return quote.excerpt === '' ? 'File' : quote.excerpt;
    case null:
      return quote.excerpt;
  }
}

export function miniWavePath(levels: readonly number[]): string {
  const bars = Math.floor((WAVE.width + WAVE.gap) / (WAVE.bar + WAVE.gap));
  const per = levels.length / bars;
  return Array.from({ length: bars }, (_, index) => {
    const window = levels.slice(Math.floor(index * per), Math.max(Math.ceil((index + 1) * per), 1));
    const peak = window.reduce((top, level) => Math.max(top, level), 0);
    const height = Math.max(WAVE.floor, (peak / 255) * WAVE.height);
    const top = (WAVE.height - height) / 2;
    const x = index * (WAVE.bar + WAVE.gap);
    return barPath(
      { x, width: WAVE.bar, top, bottom: top + height },
      { top: WAVE.bar / 2, bottom: WAVE.bar / 2 },
    );
  }).join(' ');
}

function MiniWave({
  levels,
  ink,
}: {
  readonly levels: readonly number[];
  readonly ink: ParticipantInk;
}): ReactNode {
  const fill = useColour(ink);
  return (
    <View aria-hidden className="self-center">
      <Svg width={WAVE.width} height={WAVE.height}>
        <Path d={miniWavePath(levels)} fill={fill} fillOpacity={WAVE.opacity} />
      </Svg>
    </View>
  );
}

function Thumb({ attachment }: { readonly attachment: AssistantAttachment }): ReactNode {
  const links = useAttachmentLinks([attachment.id]);
  const [broken, setBroken] = useState(false);
  const url = links.data?.[attachment.id]?.url;
  return (
    <View className="size-7 items-center justify-center self-center overflow-hidden rounded-sm bg-surface-2">
      {broken ? <Icon name="image" size={16} tone="faint" /> : null}
      {url === undefined || broken ? null : (
        <LoadedImage
          url={url}
          label={attachment.name}
          resizeMode="cover"
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </View>
  );
}

function FileTile(): ReactNode {
  return (
    <View className="size-7 items-center justify-center self-center rounded-sm bg-primary/15">
      <Icon name="fileText" size={16} tone="primary" />
    </View>
  );
}

function StripEnd({
  quote,
  source,
}: {
  readonly quote: MessageQuote;
  readonly source: QuoteSource;
}): ReactNode {
  if (source.kind === 'deleted') return null;
  const { attachment, ink } = source;
  if (quote.media_kind === 'file') return <FileTile />;
  if (attachment === null) return null;
  if (quote.media_kind === 'image') return <Thumb attachment={attachment} />;
  const levels = attachment.levels;
  return quote.media_kind === 'voice' && levels !== undefined && levels !== null ? (
    <MiniWave levels={levels} ink={ink} />
  ) : null;
}

const MEDIA_GLYPH = { image: 'image', voice: 'mic' } as const;

function StripText({
  quote,
  source,
}: {
  readonly quote: MessageQuote;
  readonly source: QuoteSource;
}): ReactNode {
  const shown = source.kind === 'shown';
  const glyph =
    quote.media_kind === 'image' || quote.media_kind === 'voice'
      ? MEDIA_GLYPH[quote.media_kind]
      : null;
  return (
    <View className="min-w-0 flex-1 justify-center">
      <Text
        variant="caption"
        numberOfLines={1}
        className={shown ? INK_TEXT[source.ink] : 'text-on-surface-faint'}
      >
        {shown ? source.name : 'deleted'}
      </Text>
      <View className="min-w-0 flex-row items-center gap-1">
        {glyph === null || !shown ? null : <Icon name={glyph} size={16} colour={source.ink} />}
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {shown ? quoteLine(quote, source.attachment) : quote.excerpt}
        </Text>
      </View>
    </View>
  );
}

export function QuoteStrip({
  quote,
  source,
}: {
  readonly quote: MessageQuote;
  readonly source: QuoteSource;
}): ReactNode {
  const rail = source.kind === 'shown' ? INK_RAIL[source.ink] : 'bg-outline';
  const who = source.kind === 'shown' ? source.name : 'a deleted message';
  return (
    <Interactive
      label={`Quoting ${who}: ${quote.excerpt}`}
      onPress={() => {
        router.setParams({ message: quote.message_id });
      }}
      className="min-h-8.5 max-w-full flex-row items-stretch gap-2"
      layerClassName="rounded-sm"
    >
      <View className={cn('w-0.5 rounded-full', rail)} />
      <StripText quote={quote} source={source} />
      <StripEnd quote={quote} source={source} />
    </Interactive>
  );
}
