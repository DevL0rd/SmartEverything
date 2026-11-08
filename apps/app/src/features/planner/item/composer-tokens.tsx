import type { PlannerColourKey } from '@smarteverything/domain';
import type { ReactNode, RefObject } from 'react';
import { Text as NativeText, TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { useFocusOnMount } from '../../../components/use-focus-on-mount';
import { cn } from '../../../design/cn';
import { isNative, useIdiom } from '../../../design/platform';

export type TokenKind = 'plain' | 'when' | 'tag' | 'list' | 'priority';

export interface ComposerToken {
  readonly text: string;
  readonly kind: TokenKind;
}

export interface TokenReading {
  readonly title: string;
  readonly listName: string | null;
}

const PRIORITY = /^!([1-3])$/;
const HASH = /^#([\p{L}\p{N}_-]+)[,.;]?$/u;
const EDGES = /^[\s,;:.&-]+|[\s,;:.&-]+$/g;

function bare(word: string): string {
  return word.replace(EDGES, '');
}

function markerOf(word: string, listName: string | null): TokenKind | null {
  if (PRIORITY.test(word)) return 'priority';
  const hash = HASH.exec(word);
  if (hash === null) return null;
  return listName !== null && hash[1]?.toLowerCase() === listName.toLowerCase() ? 'list' : 'tag';
}

function wordKinds(words: readonly string[], reading: TokenReading | null): readonly TokenKind[] {
  const title = reading === null ? [] : reading.title.split(/\s+/).filter((word) => word !== '');
  let next = 0;
  return words.map((word) => {
    const marker = markerOf(word, reading?.listName ?? null);
    if (marker !== null) return marker;
    if (reading === null) return 'plain';
    const wanted = title[next];
    if (wanted !== undefined && (word === wanted || bare(word) === wanted)) {
      next += 1;
      return 'plain';
    }
    return 'when';
  });
}

function spaceKind(before: TokenKind | undefined, after: TokenKind | undefined): TokenKind {
  return before !== undefined && before === after && before !== 'plain' ? before : 'plain';
}

function merged(pieces: readonly ComposerToken[]): readonly ComposerToken[] {
  return pieces.reduce<readonly ComposerToken[]>((tokens, piece) => {
    const last = tokens.at(-1);
    if (last?.kind !== piece.kind) return [...tokens, piece];
    return [...tokens.slice(0, -1), { kind: piece.kind, text: last.text + piece.text }];
  }, []);
}

const DURATION =
  /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![\p{L}])/giu;

const UNIT_MS = { hour: 3_600_000, minute: 60_000, second: 1000 } as const;

function unitMs(unit: string): number {
  const first = unit.charAt(0).toLowerCase();
  if (first === 'h') return UNIT_MS.hour;
  return first === 'm' ? UNIT_MS.minute : UNIT_MS.second;
}

export interface TimerReading {
  readonly ms: number;
  readonly label: string | null;
}

export function timerReadingOf(text: string): TimerReading | null {
  const ms = [...text.matchAll(DURATION)].reduce(
    (total, [, amount = '0', unit = 's']) =>
      total + Number(amount.replace(',', '.')) * unitMs(unit),
    0,
  );
  if (ms <= 0) return null;
  const label = text.replace(DURATION, ' ').replace(/\s+/g, ' ').replace(EDGES, '');
  return { ms: Math.round(ms), label: label === '' ? null : label };
}

export function composerTokens(
  text: string,
  reading: TokenReading | null,
): readonly ComposerToken[] {
  const pieces = text.split(/(\s+)/).filter((piece) => piece !== '');
  const words = pieces.filter((piece) => piece.trim() !== '');
  const kinds = wordKinds(words, reading);
  let index = 0;
  const labelled = pieces.map((piece): ComposerToken => {
    if (piece.trim() === '')
      return { text: piece, kind: spaceKind(kinds[index - 1], kinds[index]) };
    const kind = kinds[index] ?? 'plain';
    index += 1;
    return { text: piece, kind };
  });
  return merged(labelled);
}

export const LIST_DOT: Readonly<Record<PlannerColourKey, string>> = {
  work: 'bg-viz-6',
  family: 'bg-viz-1',
  personal: 'bg-viz-3',
  health: 'bg-positive',
  home: 'bg-viz-4',
  shopping: 'bg-viz-5',
};

const LIST_TINT: Readonly<Record<PlannerColourKey, string>> = {
  work: 'bg-viz-6/20',
  family: 'bg-viz-1/20',
  personal: 'bg-viz-3/20',
  health: 'bg-positive/20',
  home: 'bg-viz-4/20',
  shopping: 'bg-viz-5/20',
};

function tokenClass(kind: TokenKind, colour: PlannerColourKey | null): string {
  if (kind === 'when') return 'rounded-xs bg-primary-container text-primary';
  if (kind === 'priority') return 'rounded-xs bg-critical/15 text-critical';
  if (kind === 'tag') return 'rounded-xs bg-surface-3';
  if (kind === 'list')
    return cn('rounded-xs', colour === null ? 'bg-surface-3' : LIST_TINT[colour]);
  return '';
}

const FIELD_TEXT = 'font-sans text-body';

export function TokenText({
  tokens,
  colour,
}: {
  readonly tokens: readonly ComposerToken[];
  readonly colour: PlannerColourKey | null;
}): ReactNode {
  return (
    <NativeText className={cn(FIELD_TEXT, 'text-on-surface')}>
      {tokens.map((token, index) => (
        <NativeText key={String(index)} className={tokenClass(token.kind, colour)}>
          {token.text}
        </NativeText>
      ))}
    </NativeText>
  );
}

export interface FieldKeys {
  readonly onSubmit: () => void;
  readonly onTab: (() => void) | null;
  readonly onEscape: () => void;
}

export interface TokenFieldProps extends FieldKeys {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly tokens: readonly ComposerToken[];
  readonly colour: PlannerColourKey | null;
  readonly placeholder: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly inputRef: RefObject<TextInput | null>;
}

function handleKey(event: TextInputKeyPressEvent, keys: FieldKeys): void {
  const native = event.nativeEvent;
  const shift = 'shiftKey' in native && native.shiftKey === true;
  if (native.key === 'Enter' && !shift) {
    event.preventDefault();
    keys.onSubmit();
    return;
  }
  if (native.key === 'Tab' && !shift && keys.onTab !== null) {
    event.preventDefault();
    keys.onTab();
    return;
  }
  if (native.key === 'Escape') keys.onEscape();
}

export function TokenField({
  value,
  onChange,
  tokens,
  colour,
  placeholder,
  label,
  disabled,
  inputRef,
  onSubmit,
  onTab,
  onEscape,
}: TokenFieldProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const native = isNative();
  useFocusOnMount(true, inputRef);
  return (
    <View className={cn('relative py-1', pointer ? 'min-h-9' : 'min-h-12')}>
      <View aria-hidden pointerEvents="none" className="absolute inset-x-0 top-1">
        <TokenText tokens={tokens} colour={colour} />
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onKeyPress={(event) => {
          if (pointer) handleKey(event, { onSubmit, onTab, onEscape });
        }}
        {...(native
          ? { returnKeyType: 'done', submitBehavior: 'submit', onSubmitEditing: onSubmit }
          : {})}
        editable={!disabled}
        multiline
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColorClassName="accent-on-surface-variant"
        cursorColorClassName="accent-primary"
        selectionColorClassName="accent-primary"
        className={cn(
          FIELD_TEXT,
          'p-0 text-transparent web:field-sizing-content web:resize-none web:outline-none',
        )}
      />
    </View>
  );
}
