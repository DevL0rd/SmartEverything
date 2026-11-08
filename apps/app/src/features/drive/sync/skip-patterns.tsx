import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { plural } from '../../../format/text';

export const SKIP_TITLE = 'Skip these';

export const ADD_PATTERN = 'Add pattern';

const PATTERN_HELPER = 'A name like *.tmp matches anywhere. Use / for a path, like Films/Raw/**.';

const BRACKETS = [
  ['[', ']'],
  ['{', '}'],
] as const;

function balanced(pattern: string, open: string, close: string): boolean {
  let depth = 0;
  for (const character of pattern) {
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function shapeProblemOf(pattern: string): string | null {
  if (pattern.startsWith('/') || /^[A-Za-z]:/.test(pattern)) {
    return 'Use a path inside the folder, without a leading slash or drive letter';
  }
  if (pattern.includes('\\')) return 'Use / between folders';
  if (pattern.split('/').includes('..')) return 'A pattern cannot reach outside the folder';
  if (BRACKETS.some(([open, close]) => !balanced(pattern, open, close))) {
    return 'Close every bracket you open';
  }
  return null;
}

export function skipPatternProblemOf(text: string, existing: readonly string[]): string | null {
  const pattern = text.trim();
  if (pattern === '') return 'Type a pattern';
  const shape = shapeProblemOf(pattern);
  if (shape !== null) return shape;
  return existing.includes(pattern) ? 'This pattern is already in the list' : null;
}

export function withPattern(patterns: readonly string[], text: string): readonly string[] {
  return [...patterns, text.trim()];
}

export function withoutPattern(patterns: readonly string[], pattern: string): readonly string[] {
  return patterns.filter((one) => one !== pattern);
}

export const NOTHING_SKIPPED = 'Nothing is skipped';

export interface SkipPatternsProps {
  readonly patterns: readonly string[];
  readonly editable: boolean;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly footer: string;
  readonly onChange: (patterns: readonly string[]) => void;
}

function PatternRow({
  pattern,
  editable,
  busy,
  onRemove,
}: {
  readonly pattern: string;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <View className="min-h-row-h flex-row items-center gap-3 px-4 py-1">
      <Text variant="callout" className="min-w-0 flex-1 font-mono" numberOfLines={1}>
        {pattern}
      </Text>
      {editable ? (
        <IconButton icon="x" label={`Remove ${pattern}`} disabled={busy} onPress={onRemove} />
      ) : null}
    </View>
  );
}

function AddPatternField({
  patterns,
  busy,
  onAdd,
  onCancel,
}: {
  readonly patterns: readonly string[];
  readonly busy: boolean;
  readonly onAdd: (pattern: string) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const problem = skipPatternProblemOf(text, patterns);
  const add = (): void => {
    setTried(true);
    if (problem === null) onAdd(text);
  };
  return (
    <View className="gap-2 px-4 py-3">
      <TextField
        label="New pattern"
        kind="code"
        value={text}
        placeholder="**/cache/**"
        helper={PATTERN_HELPER}
        error={tried || text.trim() !== '' ? problem : null}
        focusOnMount
        onChange={setText}
        onSubmit={add}
      />
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button label="Cancel" variant="tonal" disabled={busy} onPress={onCancel} />
        <Button label="Add" icon="plus" loading={busy} disabled={busy} onPress={add} />
      </View>
    </View>
  );
}

function AddRow({
  patterns,
  busy,
  onChange,
}: Omit<SkipPatternsProps, 'editable' | 'problem' | 'footer'>): ReactNode {
  const [adding, setAdding] = useState(false);
  if (!adding) {
    return (
      <ListRow
        title={ADD_PATTERN}
        icon="plus"
        disabled={busy}
        onPress={() => {
          setAdding(true);
        }}
      />
    );
  }
  return (
    <AddPatternField
      patterns={patterns}
      busy={busy}
      onAdd={(pattern) => {
        onChange(withPattern(patterns, pattern));
        setAdding(false);
      }}
      onCancel={() => {
        setAdding(false);
      }}
    />
  );
}

export function SkipPatterns({
  patterns,
  editable,
  busy,
  problem,
  footer,
  onChange,
}: SkipPatternsProps): ReactNode {
  return (
    <View className="gap-1">
      <List
        title={SKIP_TITLE}
        {...(patterns.length === 0 ? {} : { caption: plural(patterns.length, 'pattern') })}
        footer={footer}
      >
        {patterns.map((pattern) => (
          <PatternRow
            key={pattern}
            pattern={pattern}
            editable={editable}
            busy={busy}
            onRemove={() => {
              onChange(withoutPattern(patterns, pattern));
            }}
          />
        ))}
        {editable ? <AddRow patterns={patterns} busy={busy} onChange={onChange} /> : null}
        {!editable && patterns.length === 0 ? (
          <ListRow title={NOTHING_SKIPPED} icon="filter" />
        ) : null}
      </List>
      {problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4">
          {problem}
        </Text>
      )}
    </View>
  );
}
