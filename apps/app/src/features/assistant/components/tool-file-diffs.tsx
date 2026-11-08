import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { z } from 'zod';
import type { AI_HARNESS_ENDPOINTS } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Interactive } from '../../../components/interactive';
import { cn } from '../../../design/cn';
import {
  visibleDiffLines,
  DIFF_PREVIEW_LINES,
  DIFF_RENDER_LINES,
  type ToolFileDiff,
} from '../model/tool-file-diffs';
import { DiffCode } from '../../../components/diff-code';
import { DIFF_LINE_CHARACTERS, type FileDiffLine } from '../../../components/diff-line';
import { diffLanguage } from '../../../components/diff-language';
import { RecordedDiffSourceSheet } from './recorded-diff-source';
import { CHAT_SURFACE } from './chat-surface';

function Expand({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      hitSlop={8}
      className="min-h-6 shrink-0 justify-center self-start"
    >
      <Text variant="footnote" tone="primary" numberOfLines={1} className="font-sans-medium">
        {label}
      </Text>
    </Interactive>
  );
}
function DiffCounts({ diff }: { readonly diff: ToolFileDiff }): ReactNode {
  if (diff.added === null) return null;
  return (
    <View
      accessible
      accessibilityLabel={countDescription(diff)}
      className="shrink-0 flex-row gap-1.5"
    >
      {diff.truncated ? (
        <Text variant="caption" tone="faint">
          Partial
        </Text>
      ) : null}
      <Text variant="caption" tone="positive" className="tabular">
        {`+${String(diff.added)}`}
      </Text>
      {diff.removed === null ? null : (
        <Text variant="caption" tone="critical" className="tabular">
          {`−${String(diff.removed)}`}
        </Text>
      )}
    </View>
  );
}
function DiffHeading({ diff }: { readonly diff: ToolFileDiff }): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center gap-1.5">
      <Text variant="caption" tone="faint" ellipsize="middle" className="shrink">
        {diff.path}
      </Text>
      <DiffCounts diff={diff} />
    </View>
  );
}
function DiffActions({
  expanded,
  more,
  context,
  hasLines,
  expand,
  collapse,
  showContext,
}: {
  readonly expanded: boolean;
  readonly more: boolean;
  readonly context: boolean;
  readonly hasLines: boolean;
  readonly expand: () => void;
  readonly collapse: () => void;
  readonly showContext: () => void;
}): ReactNode {
  const actions = [
    !expanded && more ? <Expand key="more" label="Show more changes" onPress={expand} /> : null,
    expanded ? <Expand key="less" label="Show less" onPress={collapse} /> : null,
    hasLines && !context ? (
      <Expand key="context" label="Show context" onPress={showContext} />
    ) : null,
  ].filter((action) => action !== null);
  return actions.length === 0 ? null : <View className="flex-row gap-x-4">{actions}</View>;
}
function DiffNotes({
  diff,
  context,
  limited,
}: {
  readonly diff: ToolFileDiff;
  readonly context: boolean;
  readonly limited: boolean;
}): ReactNode {
  return (
    <>
      {context && !diff.contextRecorded ? (
        <Text variant="caption" tone="faint">
          More context wasn’t recorded
        </Text>
      ) : null}
      {diff.truncated || diff.displayLimited || limited ? (
        <Text variant="caption" tone="faint">
          Inline preview limited · open recorded details for retained source.
        </Text>
      ) : null}
    </>
  );
}
function FileDiff({ diff }: { readonly diff: ToolFileDiff }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState(false);
  const lines = useMemo(
    () => visibleDiffLines(diff, context, expanded ? DIFF_RENDER_LINES : DIFF_PREVIEW_LINES),
    [diff, context, expanded],
  );
  const more = visibleDiffLines(diff, context, DIFF_RENDER_LINES + 1).length > lines.length;
  return (
    <View className={cn(CHAT_SURFACE, 'min-w-0 gap-0.5 px-2.5 py-2')}>
      <DiffHeading diff={diff} />
      {diff.message === null ? null : (
        <Text variant="caption" tone="faint">
          {diff.message}
        </Text>
      )}
      {lines.length === 0 ? null : <DiffCode lines={lines} language={diff.language} />}
      <DiffActions
        expanded={expanded}
        more={more}
        context={context}
        hasLines={lines.length > 0}
        expand={() => {
          setExpanded(true);
        }}
        collapse={() => {
          setExpanded(false);
          setContext(false);
        }}
        showContext={() => {
          setContext(true);
        }}
      />
      <DiffNotes diff={diff} context={context} limited={expanded ? more : false} />
      <RecordedSourceAccess diff={diff} />
    </View>
  );
}
export function FileDiffList({
  diffs,
  className,
}: {
  readonly diffs: readonly ToolFileDiff[];
  readonly className?: string;
}): ReactNode {
  return (
    <View className={cn('min-w-0 gap-2', className)}>
      {diffs.map((diff, index) => (
        <FileDiff key={`${diff.path}:${String(index)}`} diff={diff} />
      ))}
    </View>
  );
}

type WorkspaceFile = z.output<
  (typeof AI_HARNESS_ENDPOINTS)['readAiChatWorkspace']['response']
>['turns'][number]['files'][number];

type WorkspaceHunk = Extract<NonNullable<WorkspaceFile['diff']>, { kind: 'text' }>['hunks'][number];

const LINE_KIND = { '+': 'add', '-': 'remove' } as const;

function hunkLines(hunk: WorkspaceHunk): readonly FileDiffLine[] {
  let oldLine = hunk.old_start;
  let newLine = hunk.new_start;
  return hunk.lines.map((raw): FileDiffLine => {
    const marker = raw.charAt(0);
    const kind: FileDiffLine['kind'] =
      marker === '+' || marker === '-' ? LINE_KIND[marker] : 'context';
    const line: FileDiffLine = {
      kind,
      text: raw.slice(1),
      oldLine: kind === 'add' ? null : oldLine,
      newLine: kind === 'remove' ? null : newLine,
    };
    if (kind !== 'add') oldLine += 1;
    if (kind !== 'remove') newLine += 1;
    return line;
  });
}

const FILE_MESSAGE = {
  binary: 'Binary file · no line comparison',
  oversized: 'Too large to compare line by line',
} as const;

function operationOf(diff: WorkspaceFile['diff']): ToolFileDiff['operation'] {
  if (diff?.kind !== 'text') return 'unknown';
  if (!diff.before) return 'create';
  return diff.after ? 'update' : 'delete';
}

export function workspaceFileDiff(file: WorkspaceFile): ToolFileDiff {
  const all = file.diff?.kind === 'text' ? file.diff.hunks.flatMap(hunkLines) : [];
  const message =
    file.diff === null || file.diff.kind === 'text' ? null : FILE_MESSAGE[file.diff.kind];
  return {
    path: file.display,
    operation: operationOf(file.diff),
    lines: all.filter((line) => line.kind !== 'context'),
    contextLines: all,
    displayLimited: false,
    source: [],
    language: diffLanguage(file.path, all[0]?.text ?? ''),
    added: file.binary ? null : file.added,
    removed: file.binary ? null : file.deleted,
    truncated: false,
    message,
    contextRecorded: true,
  };
}

export function WorkspaceFileDiffs({
  files,
}: {
  readonly files: readonly WorkspaceFile[];
}): ReactNode {
  const diffs = useMemo(() => files.map(workspaceFileDiff), [files]);
  return <FileDiffList diffs={diffs} className="px-4 py-3" />;
}

function countDescription(diff: ToolFileDiff): string {
  return `${diff.truncated ? 'Partial counts. ' : ''}${String(diff.added)} added lines${diff.removed === null ? ', previous content unavailable' : `, ${String(diff.removed)} removed lines`}`;
}

function RecordedSourceAccess({ diff }: { readonly diff: ToolFileDiff }): ReactNode {
  const [open, setOpen] = useState(false);
  if (diff.source.length === 0 || !needsSourceAccess(diff)) return null;
  return (
    <>
      <Expand
        label="Open recorded source"
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <RecordedDiffSourceSheet
          path={diff.path}
          sources={diff.source}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function needsSourceAccess(diff: ToolFileDiff): boolean {
  return (
    diff.displayLimited ||
    diff.truncated ||
    diff.lines.length > DIFF_RENDER_LINES ||
    diff.lines.some((line) => line.text.length > DIFF_LINE_CHARACTERS) ||
    diff.message?.includes('inline') === true
  );
}
