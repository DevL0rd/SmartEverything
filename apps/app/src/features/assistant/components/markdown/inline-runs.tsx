import { memo, type ReactNode } from 'react';
import { Linking, Text as NativeText } from 'react-native';
import { Text, type TextVariant } from '../../../../components/text';
import { TONE_ROLE, type Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { useColour } from '../../../../design/colour';
import { breakableUrl, hostOf } from '../../../../format/text';
import { piecesOf, type Batch } from '../../model/stream-fade';
import { mentionClass } from '../mention-chip';
import { FadeSpan } from './fade-span';
import { runPartsOf, type MentionMark, type MentionRule, type RunPart } from './mention-runs';
import type { Inline } from '@smarteverything/domain/markdown';
import { startsOf } from './rendered-length';
import { background } from '@smarteverything/logging';

const THIN_SPACE = ' ';

export interface FadeSlice {
  readonly start: number;
  readonly batches: readonly Batch[];
}

interface Look {
  readonly start: number;
  readonly fade: FadeSlice | null;
  readonly colour: string;
  readonly accent: string;
}

function keep(text: string): string {
  return text;
}

function paint(
  look: Look,
  text: string,
  colour: string,
  shape: (text: string) => string = keep,
): ReactNode {
  if (look.fade === null) return shape(text);
  return piecesOf(text, look.start, look.fade.batches).map((piece) =>
    piece.batch === null ? (
      shape(piece.text)
    ) : (
      <FadeSpan key={piece.batch.id} text={shape(piece.text)} colour={colour} batch={piece.batch} />
    ),
  );
}

const LinkRun = memo(function LinkRun({
  text,
  url,
  label,
}: {
  readonly text: string;
  readonly url: string;
  readonly label: ReactNode;
}): ReactNode {
  const domain = hostOf(url);
  const bare = text === url;
  return (
    <NativeText
      accessibilityRole="link"
      onPress={() => {
        background(Linking.openURL(url), 'url.open_failed');
      }}
    >
      <NativeText className="text-primary underline">{label}</NativeText>
      {domain === null || bare ? null : (
        <NativeText className="font-sans-medium text-caption text-on-surface-variant">
          {` ${domain} ↗`}
        </NativeText>
      )}
    </NativeText>
  );
});

function MentionRun({
  text,
  mark,
  look,
}: {
  readonly text: string;
  readonly mark: MentionMark;
  readonly look: Look;
}): ReactNode {
  const ink = useColour(mark.ink);
  return (
    <NativeText className={mentionClass(mark.ink, mark.self)}>
      {paint(look, text, mark.self ? look.colour : ink)}
    </NativeText>
  );
}

function inlineNode(part: RunPart, index: number, look: Look): ReactNode {
  switch (part.kind) {
    case 'mention':
      return <MentionRun key={index} text={part.text} mark={part.mark} look={look} />;
    case 'strong':
      return (
        <NativeText key={index} className="font-sans-semibold">
          {paint(look, part.text, look.colour)}
        </NativeText>
      );
    case 'em':
      return (
        <NativeText key={index} className="italic">
          {paint(look, part.text, look.colour)}
        </NativeText>
      );
    case 'code':
      return (
        <NativeText key={index} className="rounded-xs bg-surface-2 font-mono text-footnote">
          {THIN_SPACE}
          {paint(look, part.text, look.colour)}
          {THIN_SPACE}
        </NativeText>
      );
    case 'link':
      return (
        <LinkRun
          key={index}
          text={part.text}
          url={part.url}
          label={paint(look, part.text, look.accent, part.text === part.url ? breakableUrl : keep)}
        />
      );
    case 'text':
      return paint(look, part.text, look.colour);
  }
}

function nodesOf(
  inline: readonly Inline[],
  mentions: MentionRule | null,
  fade: FadeSlice | null,
  paints: Pick<Look, 'colour' | 'accent'>,
): readonly ReactNode[] {
  const parts = runPartsOf(inline, mentions);
  const { colour, accent } = paints;
  const starts = startsOf(
    parts.map((part) => part.text),
    fade?.start ?? 0,
  );
  return parts.map((part, index) =>
    inlineNode(part, index, { start: starts[index] ?? 0, fade, colour, accent }),
  );
}

export function Runs({
  inline,
  variant = 'body',
  tone = 'default',
  align = 'start',
  selectable = false,
  endMark = null,
  fade = null,
  mentions = null,
  tabular = false,
}: {
  readonly inline: readonly Inline[];
  readonly variant?: TextVariant;
  readonly tone?: Tone;
  readonly align?: 'start' | 'end';
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
  readonly fade?: FadeSlice | null;
  readonly mentions?: MentionRule | null;
  readonly tabular?: boolean;
}): ReactNode {
  const colour = useColour(TONE_ROLE[tone]);
  const accent = useColour('primary');
  return (
    <Text
      variant={variant}
      tone={tone}
      align={align}
      selectable={selectable}
      className={cn('web:wrap-anywhere', tabular && 'tabular')}
    >
      {nodesOf(inline, mentions, fade, { colour, accent })}
      {endMark}
    </Text>
  );
}
