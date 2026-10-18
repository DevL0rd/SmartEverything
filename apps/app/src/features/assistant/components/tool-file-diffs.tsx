import { memo, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { Interactive } from '../../../components/interactive';
import {
  cachedToolFileDiffs,
  visibleDiffLines,
  DIFF_PREVIEW_LINES,
  DIFF_RENDER_LINES,
  DIFF_LINE_CHARACTERS,
  type ToolFileDiff,
} from '../model/tool-file-diffs';
import { RecordedDiffSourceSheet } from './recorded-diff-source';
import { DiffCode } from './diff-code';

function counts(diff: ToolFileDiff): string | null {
  if (diff.added === null) return null;
  return `${diff.truncated ? 'Partial · ' : ''}+${String(diff.added)}${diff.removed === null ? '' : ` −${String(diff.removed)}`}`;
}
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
      className="min-h-touch-min justify-center self-start"
    >
      <Text variant="caption" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}
function DiffHeading({ diff }: { readonly diff: ToolFileDiff }): ReactNode {
  const total = counts(diff);
  return (
    <View className="min-w-0 flex-row items-start gap-2">
      <Text variant="caption" selectable className="min-w-0 flex-1">
        {diff.path}
      </Text>
      {total === null ? null : (
        <Text variant="caption" tone="variant" accessibilityLabel={countDescription(diff)}>
          {total}
        </Text>
      )}
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
  return (
    <View className="flex-row flex-wrap gap-x-4">
      {!expanded && more ? <Expand label="Show more changes" onPress={expand} /> : null}
      {expanded ? <Expand label="Show less" onPress={collapse} /> : null}
      {hasLines && !context ? <Expand label="Show context" onPress={showContext} /> : null}
    </View>
  );
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
        <Text variant="caption" tone="variant">
          More context wasn’t recorded
        </Text>
      ) : null}
      {diff.truncated || diff.displayLimited || limited ? (
        <Text variant="caption" tone="variant">
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
  const language = diff.language;
  const more = visibleDiffLines(diff, context, DIFF_RENDER_LINES + 1).length > lines.length;
  return (
    <View className="min-w-0 gap-1 border-l border-outline-variant pl-3 py-1">
      <DiffHeading diff={diff} />
      {diff.message === null ? null : (
        <Text variant="caption" tone="variant">
          {diff.message}
        </Text>
      )}
      {lines.length === 0 ? null : (
        <>
          <DiffCode lines={lines} language={language} />
          <Text variant="caption" tone="variant">
            {language ?? 'Plain text · language unavailable'}
            {diff.operation === 'unknown' ? '' : ` · ${diff.operation}`}
          </Text>
        </>
      )}
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
export const ToolFileDiffs = memo(function ToolFileDiffs({
  tool,
  state,
}: {
  readonly tool: ChatTimelineTool;
  readonly state: ChatTimelineTool['state'];
}): ReactNode {
  const diffs = cachedToolFileDiffs(tool, state);
  if (diffs.length === 0) return null;
  return (
    <View className="min-w-0 gap-2 pl-6">
      {diffs.map((diff, index) => (
        <FileDiff key={`${diff.path}:${String(index)}`} diff={diff} />
      ))}
    </View>
  );
});

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
