import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { DIFF_LINE_CHARACTERS, type FileDiffLine } from '../model/tool-file-diffs';
import { highlightDiffLines, type DiffCodeToken, type DiffCodeTone } from '../model/diff-highlight';
import { cn } from '../../../design/cn';
import { useScopeVisible } from '../../../design/visibility';
import { useProgressiveCount } from '../../../design/progressive-count';

const log = new Logger('app.assistant-diffs');
const MARKERS = { add: '+', remove: '−', context: ' ' } as const;
const MARKER_TONES = {
  add: 'text-positive',
  remove: 'text-critical',
  context: 'text-on-surface-variant',
} as const;
const BACKGROUNDS = { add: 'bg-positive/10', remove: 'bg-critical/10', context: '' } as const;
const TONES: Readonly<Record<DiffCodeTone, string>> = {
  plain: 'text-on-surface',
  keyword: 'text-viz-3',
  string: 'text-viz-5',
  number: 'text-viz-1',
  comment: 'text-on-surface-variant',
  punctuation: 'text-on-surface-variant',
};
function useTokens(
  language: string | null,
  lines: readonly FileDiffLine[],
  onScreen: boolean,
): readonly (readonly DiffCodeToken[])[] | null {
  const [value, setValue] = useState<{
    readonly source: readonly FileDiffLine[];
    readonly tokens: readonly (readonly DiffCodeToken[])[];
  } | null>(null);
  useEffect(() => {
    if (!onScreen) return undefined;
    let active = true;
    const old = lines.filter((line) => line.kind !== 'add');
    const next = lines.filter((line) => line.kind !== 'remove');
    background(
      Promise.all([
        highlightDiffLines(
          language,
          old.map((line) => line.text),
        ),
        highlightDiffLines(
          language,
          next.map((line) => line.text),
        ),
      ]).then(
        ([before, after]) => {
          if (!active) return;
          let oldIndex = 0;
          let newIndex = 0;
          const tokens = lines.map((line) => {
            const result = line.kind === 'remove' ? before[oldIndex] : after[newIndex];
            if (line.kind !== 'add') oldIndex += 1;
            if (line.kind !== 'remove') newIndex += 1;
            return result ?? [{ text: line.text, tone: 'plain' as const }];
          });
          setValue({ source: lines, tokens });
        },
        (error: unknown) => {
          if (active) log.warn('highlight.failed', { language, error });
        },
      ),
      'promise.all_failed',
    );
    return (): void => {
      active = false;
    };
  }, [language, lines, onScreen]);
  return value?.source === lines ? value.tokens : null;
}
function CodeLine({
  line,
  tokens,
}: {
  readonly line: FileDiffLine;
  readonly tokens: readonly DiffCodeToken[] | undefined;
}): ReactNode {
  const bounded = line.text.length > DIFF_LINE_CHARACTERS;
  return (
    <View
      className={cn('flex-row', BACKGROUNDS[line.kind])}
      accessibilityLabel={`${line.kind}, old line ${line.oldLine === null ? 'unrecorded' : String(line.oldLine)}, new line ${line.newLine === null ? 'unrecorded' : String(line.newLine)}`}
    >
      <NativeText className="w-10 text-right font-mono text-caption text-on-surface-variant">
        {line.oldLine === null ? ' ' : String(line.oldLine)}
      </NativeText>
      <NativeText className="w-10 text-right font-mono text-caption text-on-surface-variant">
        {line.newLine === null ? ' ' : String(line.newLine)}
      </NativeText>
      <NativeText className={cn('w-5 text-center font-mono text-caption', MARKER_TONES[line.kind])}>
        {MARKERS[line.kind]}
      </NativeText>
      <NativeText selectable className="font-mono text-caption text-on-surface">
        {bounded
          ? `${line.text.slice(0, DIFF_LINE_CHARACTERS)} … [line limited]`
          : tokens === undefined
            ? line.text || ' '
            : tokens.map((token, index) => (
                <NativeText key={index} className={TONES[token.tone]}>
                  {token.text}
                </NativeText>
              ))}
      </NativeText>
    </View>
  );
}
export function DiffCode({
  lines,
  language,
}: {
  readonly lines: readonly FileDiffLine[];
  readonly language: string | null;
}): ReactNode {
  const tokens = useTokens(language, lines, useScopeVisible());
  const mounted = useProgressiveCount(lines.length);
  return (
    <ScrollView horizontal className="min-w-0 grow-0" contentContainerClassName="min-w-full">
      <View>
        {lines.slice(0, mounted).map((line, index) => (
          <CodeLine key={index} line={line} tokens={tokens?.[index]} />
        ))}
      </View>
    </ScrollView>
  );
}
