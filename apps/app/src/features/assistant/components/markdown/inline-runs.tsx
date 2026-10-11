import type { ReactNode } from 'react';
import { memo } from 'react';
import { Linking, Text as NativeText } from 'react-native';
import { Text, type TextVariant } from '../../../../components/text';
import type { Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { breakableUrl, hostOf } from '../../../../format/text';
import { sameJson } from '../../../../store/same-json';
import type { Inline } from './parse';

const THIN_SPACE = ' ';

function LinkRun({ text, url }: { readonly text: string; readonly url: string }): ReactNode {
  const domain = hostOf(url);
  const bare = text === url;
  return (
    <NativeText
      accessibilityRole="link"
      onPress={() => {
        void Linking.openURL(url);
      }}
    >
      <NativeText className="text-primary underline">{bare ? breakableUrl(text) : text}</NativeText>
      {domain === null || bare ? null : (
        <NativeText className="font-sans-medium text-caption text-on-surface-variant">
          {` ${domain} ↗`}
        </NativeText>
      )}
    </NativeText>
  );
}

function InlineRunBase({ part }: { readonly part: Inline }): ReactNode {
  switch (part.kind) {
    case 'strong':
      return <NativeText className="font-sans-semibold">{part.text}</NativeText>;
    case 'em':
      return <NativeText className="italic">{part.text}</NativeText>;
    case 'code':
      return (
        <NativeText className="rounded-xs bg-surface-2 font-mono text-footnote">
          {`${THIN_SPACE}${part.text}${THIN_SPACE}`}
        </NativeText>
      );
    case 'link':
      return <LinkRun text={part.text} url={part.url} />;
    case 'text':
      return part.text;
  }
}

const InlineRun = memo(InlineRunBase, (left, right) => sameJson(left.part, right.part));

export function Runs({
  inline,
  variant = 'body',
  tone = 'default',
  weight = 'regular',
  align = 'start',
  selectable = false,
  endMark = null,
}: {
  readonly inline: readonly Inline[];
  readonly variant?: TextVariant;
  readonly tone?: Tone;
  readonly weight?: 'regular' | 'medium';
  readonly align?: 'start' | 'end';
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
}): ReactNode {
  return (
    <Text
      variant={variant}
      tone={tone}
      align={align}
      selectable={selectable}
      className={cn(weight === 'medium' && 'font-sans-medium')}
    >
      {inline.map((part, index) => (
        <InlineRun key={index} part={part} />
      ))}
      {endMark}
    </Text>
  );
}
