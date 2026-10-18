import { memo, type ReactNode } from 'react';
import { Linking, Text as NativeText } from 'react-native';
import { Text, type TextVariant } from '../../../../components/text';
import { TONE_ROLE, type Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { useColour } from '../../../../design/colour';
import { breakableUrl, hostOf } from '../../../../format/text';
import { piecesOf, type Batch } from '../../model/stream-fade';
import { FadeSpan } from './fade-span';
import type { Inline } from './parse';
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

function inlineNode(part: Inline, index: number, look: Look): ReactNode {
  switch (part.kind) {
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
  fade: FadeSlice | null,
  colour: string,
  accent: string,
): readonly ReactNode[] {
  const starts = startsOf(
    inline.map((part) => part.text),
    fade?.start ?? 0,
  );
  return inline.map((part, index) =>
    inlineNode(part, index, { start: starts[index] ?? 0, fade, colour, accent }),
  );
}

export function Runs({
  inline,
  variant = 'body',
  tone = 'default',
  weight = 'regular',
  align = 'start',
  selectable = false,
  endMark = null,
  fade = null,
}: {
  readonly inline: readonly Inline[];
  readonly variant?: TextVariant;
  readonly tone?: Tone;
  readonly weight?: 'regular' | 'medium';
  readonly align?: 'start' | 'end';
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
  readonly fade?: FadeSlice | null;
}): ReactNode {
  const colour = useColour(TONE_ROLE[tone]);
  const accent = useColour('primary');
  return (
    <Text
      variant={variant}
      tone={tone}
      align={align}
      selectable={selectable}
      className={cn(weight === 'medium' && 'font-sans-medium')}
    >
      {nodesOf(inline, fade, colour, accent)}
      {endMark}
    </Text>
  );
}
