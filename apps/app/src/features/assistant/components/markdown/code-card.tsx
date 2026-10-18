import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { CopyButton } from '../../../../components/copy-button';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { useColour } from '../../../../design/colour';
import { cn } from '../../../../design/cn';
import { useSizeClass } from '../../../../design/size-class';
import { useScopeVisible } from '../../../../design/visibility';
import { plural } from '../../../../format/text';
import { highlight, type CodeTone } from './code-highlight';

const COLLAPSED_LINES = 16;

const HIGHLIGHT_MAX = 6000;

interface ToneStyle {
  readonly color: string;
}

function useToneStyles(): Readonly<Record<CodeTone, ToneStyle>> {
  const plain = useColour('on-surface');
  const keyword = useColour('viz-3');
  const string = useColour('viz-5');
  const number = useColour('viz-1');
  const muted = useColour('on-surface-variant');
  return useMemo(
    () => ({
      plain: { color: plain },
      keyword: { color: keyword },
      string: { color: string },
      number: { color: number },
      muted: { color: muted },
    }),
    [plain, keyword, string, number, muted],
  );
}

function CodeText({ code }: { readonly code: string }): ReactNode {
  const styles = useToneStyles();
  const onScreen = useScopeVisible();
  const tokens = useMemo(
    () =>
      onScreen && code.length <= HIGHLIGHT_MAX
        ? highlight(code)
        : [{ text: code, tone: 'plain' as const }],
    [code, onScreen],
  );
  return (
    <NativeText selectable className="font-mono text-footnote leading-5" style={styles.plain}>
      {tokens.map((token, index) =>
        token.tone === 'plain' ? (
          token.text
        ) : (
          <NativeText key={index} style={styles[token.tone]}>
            {token.text}
          </NativeText>
        ),
      )}
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
