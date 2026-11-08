import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { cn } from '../../../../design/cn';
import { useColour } from '../../../../design/colour';
import { useSizeClass } from '../../../../design/size-class';
import { useScopeVisible } from '../../../../design/visibility';
import { CHAT_SURFACE } from '../chat-surface';
import { CardAction, CardCopy } from './card-action';
import { highlight, type CodeTone } from './code-highlight';

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
    <NativeText selectable className="font-mono text-footnote leading-4.75" style={styles.plain}>
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

export function CodeCard({
  code,
  label,
}: {
  readonly code: string;
  readonly label: string;
}): ReactNode {
  const compact = useSizeClass().width === 'compact';
  const [wrapped, setWrapped] = useState(compact);
  return (
    <View className={cn('overflow-hidden', CHAT_SURFACE)}>
      <View className="h-7.5 flex-row items-center pl-3 pr-1.5">
        <NativeText className="flex-1 font-sans text-caption text-on-surface-faint">
          {label}
        </NativeText>
        <CardAction
          icon="textWrap"
          label={wrapped ? 'No wrap' : 'Wrap'}
          selected={wrapped}
          onPress={() => {
            setWrapped(!wrapped);
          }}
        />
        <CardCopy value={code} what={label} />
      </View>
      {wrapped ? (
        <View className="px-3 pb-2.5">
          <CodeText code={code} />
        </View>
      ) : (
        <ScrollView horizontal className="grow-0" contentContainerClassName="px-3 pb-2.5">
          <CodeText code={code} />
        </ScrollView>
      )}
    </View>
  );
}
