import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { CopyButton } from '../../../../components/copy-button';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { useSizeClass } from '../../../../design/size-class';
import { plural } from '../../../../format/text';
import { highlight, type CodeTone } from './code-highlight';

const COLLAPSED_LINES = 16;

const HIGHLIGHT_MAX = 6000;

const TONE: Readonly<Record<CodeTone, string>> = {
  plain: 'text-on-surface',
  keyword: 'text-viz-3',
  string: 'text-viz-5',
  number: 'text-viz-1',
  punctuation: 'text-on-surface-variant',
  comment: 'text-on-surface-variant',
};

function CodeText({ code }: { readonly code: string }): ReactNode {
  const tokens = useMemo(
    () =>
      code.length > HIGHLIGHT_MAX ? [{ text: code, tone: 'plain' as const }] : highlight(code),
    [code],
  );
  return (
    <NativeText selectable className="font-mono text-footnote leading-5">
      {tokens.map((token, index) => (
        <NativeText key={index} className={TONE[token.tone]}>
          {token.text}
        </NativeText>
      ))}
    </NativeText>
  );
}

function ShowAll({
  lines,
  onPress,
}: {
  readonly lines: number;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`Show all ${plural(lines, 'line')}`}
      onPress={onPress}
      className="min-h-touch-min items-center justify-center border-t border-outline-variant"
    >
      <Text variant="label" tone="primary">
        {`Show all ${plural(lines, 'line')}`}
      </Text>
    </Interactive>
  );
}

export function CodeCard({
  code,
  label,
}: {
  readonly code: string;
  readonly label: string;
}): ReactNode {
  const compact = useSizeClass().width === 'compact';
  const [wrapped, setWrapped] = useState(compact);
  const [expanded, setExpanded] = useState(false);
  const lines = code.split('\n');
  const long = lines.length > COLLAPSED_LINES && !expanded;
  const shown = long ? lines.slice(0, COLLAPSED_LINES).join('\n') : code;
  return (
    <View className="overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-1">
      <View className="flex-row items-center bg-surface-2 pl-3.5 pr-1">
        <NativeText className="flex-1 font-mono text-caption text-on-surface-variant">
          {label}
        </NativeText>
        <IconButton
          icon="textWrap"
          label={wrapped ? 'No wrap' : 'Wrap'}
          selected={wrapped}
          onPress={() => {
            setWrapped(!wrapped);
          }}
        />
        <CopyButton value={code} label={`Copy ${label}`} />
      </View>
      {wrapped ? (
        <View className={cn('px-3.5 py-3', long && 'opacity-95')}>
          <CodeText code={shown} />
        </View>
      ) : (
        <ScrollView horizontal className="grow-0" contentContainerClassName="px-3.5 py-3">
          <CodeText code={shown} />
        </ScrollView>
      )}
      {long ? (
        <ShowAll
          lines={lines.length}
          onPress={() => {
            setExpanded(true);
          }}
        />
      ) : null}
    </View>
  );
}
