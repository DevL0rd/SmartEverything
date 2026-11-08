import { useEffect, useState, type ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { DIFF_LINE_CHARACTERS, type FileDiffLine } from './diff-line';
import { highlightDiffLines, type DiffCodeToken, type DiffCodeTone } from './diff-highlight';
import { cn } from '../design/cn';
import { useScopeVisible } from '../design/visibility';
import { useProgressiveCount } from '../design/progressive-count';

const log = new Logger('app.diff-code');
const MARKERS = { add: '+', remove: '−', context: ' ' } as const;
const MARKER_TONES = {
  add: 'text-positive',
  remove: 'text-critical',
  context: 'text-on-surface-variant',
} as const;
const BACKGROUNDS = { add: 'bg-positive/8', remove: 'bg-critical/8', context: '' } as const;
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
function lineLabel(line: FileDiffLine): string {
  const old = line.oldLine === null ? 'unrecorded' : String(line.oldLine);
  const next = line.newLine === null ? 'unrecorded' : String(line.newLine);
  return `${line.kind}, old line ${old}, new line ${next}: ${line.text}`;
}
function Gutter({
  line,
  digits,
}: {
  readonly line: FileDiffLine;
  readonly digits: number;
}): ReactNode {
  const number = line.newLine ?? line.oldLine;
  return (
    <NativeText aria-hidden className="pr-2 font-mono text-caption text-on-surface-faint">
      {(number === null ? '' : String(number)).padStart(digits)}
    </NativeText>
  );
}
function CodeLine({
  line,
  tokens,
  gutter,
}: {
  readonly line: FileDiffLine;
  readonly tokens: readonly DiffCodeToken[] | undefined;
  readonly gutter: number | null;
}): ReactNode {
  const text =
    line.text.length > DIFF_LINE_CHARACTERS ? line.text.slice(0, DIFF_LINE_CHARACTERS) : line.text;
  return (
    <View
      accessible
      accessibilityLabel={lineLabel(line)}
      className={cn('-mx-1 min-w-0 flex-row rounded-xs px-1', BACKGROUNDS[line.kind])}
    >
      {gutter === null ? null : <Gutter line={line} digits={gutter} />}
      <NativeText aria-hidden className={cn('w-3 font-mono text-caption', MARKER_TONES[line.kind])}>
        {MARKERS[line.kind]}
      </NativeText>
      <NativeText
        selectable
        numberOfLines={1}
        ellipsizeMode="tail"
        className="min-w-0 flex-1 font-mono text-caption text-on-surface"
      >
        {tokens === undefined || text !== line.text
          ? text || ' '
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
  gutter = null,
}: {
  readonly lines: readonly FileDiffLine[];
  readonly language: string | null;
  readonly gutter?: number | null;
}): ReactNode {
  const tokens = useTokens(language, lines, useScopeVisible());
  const mounted = useProgressiveCount(lines.length);
  return (
    <View className="min-w-0">
      {lines.slice(0, mounted).map((line, index) => (
        <CodeLine key={index} line={line} tokens={tokens?.[index]} gutter={gutter} />
      ))}
    </View>
  );
}
