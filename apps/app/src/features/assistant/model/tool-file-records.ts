import { z } from 'zod';
import type { ChatTimelineTool } from '@smarteverything/domain';
import { reportedRecord, toolKey } from './tool-presentation-text';

export type FileToolEvidence = Pick<
  ChatTimelineTool,
  'input' | 'output' | 'name' | 'state' | 'redacted'
>;

const PATH = z.string().min(1).max(4096);
const OPERATION = z.enum(['create', 'update', 'delete', 'rename']);
const DIFF = z.object({
  path: PATH,
  oldText: z.string().nullable(),
  newText: z.string(),
  oldStart: z.int().positive().optional(),
  newStart: z.int().positive().optional(),
  confirmed: z.boolean().optional(),
  truncated: z.boolean().optional(),
});
const META = z.object({
  path: PATH.optional(),
  operation: OPERATION.optional(),
  diffs: z.array(DIFF).max(32),
  truncated: z.boolean().optional(),
});
const NATIVE_OPERATION = z.enum(['create', 'add', 'update', 'delete', 'rename']);
const CHANGES = z.object({
  status: z.string().max(100).optional(),
  changes: z
    .array(
      z.object({
        path: PATH,
        diff: z.string(),
        kind: z
          .union([
            NATIVE_OPERATION,
            z.object({
              type: NATIVE_OPERATION,
              move_path: PATH.nullish(),
              movePath: PATH.nullish(),
            }),
          ])
          .optional(),
        confirmed: z.boolean().optional(),
        binary: z.boolean().optional(),
        size: z.int().nonnegative().optional(),
        truncated: z.boolean().optional(),
      }),
    )
    .max(32),
});
const HUNK = z.object({
  oldStart: z.int().nonnegative(),
  newStart: z.int().nonnegative(),
  oldLines: z.int().nonnegative(),
  newLines: z.int().nonnegative(),
  lines: z.array(z.string()),
});
const CLAUDE = z.object({
  filePath: PATH,
  structuredPatch: z.array(HUNK).max(64),
  originalFile: z.string().nullable(),
  content: z.string().optional(),
  type: z.enum(['create', 'update']).optional(),
  staged: z.boolean().optional(),
});
export interface RecordedFile {
  readonly path: string;
  readonly operation: z.infer<typeof OPERATION> | 'unknown';
  readonly evidence:
    | {
        readonly kind: 'text';
        readonly before: string | null;
        readonly after: string;
        readonly oldStart: number | null;
        readonly newStart: number | null;
        readonly fullContext: boolean;
      }
    | { readonly kind: 'patch'; readonly patch: string; readonly before?: string | null }
    | { readonly kind: 'binary'; readonly size: number | null }
    | { readonly kind: 'status'; readonly message: string };
  readonly truncated: boolean;
}
function status(path: string, message: string): RecordedFile {
  return { path, operation: 'unknown', evidence: { kind: 'status', message }, truncated: false };
}
function nativeFiles(output: unknown, confirmed: boolean): readonly RecordedFile[] {
  const parsed = CHANGES.safeParse(output);
  if (!parsed.success) return [];
  return parsed.data.changes.map((change): RecordedFile => {
    if ((!confirmed || parsed.data.status !== 'completed') && change.confirmed !== true)
      return status(change.path, 'Change not confirmed');
    return {
      path: nativePath(change),
      operation: nativeOperation(change.kind),
      truncated: change.truncated === true,
      evidence:
        change.binary === true || /(?:Binary files|GIT binary patch)/.test(change.diff)
          ? { kind: 'binary', size: change.size ?? null }
          : { kind: 'patch', patch: change.diff },
    };
  });
}
function claudeFile(output: unknown, confirmed: boolean): readonly RecordedFile[] {
  const parsed = CLAUDE.safeParse(output);
  if (!parsed.success) return [];
  const file = parsed.data;
  if (!confirmed || file.staged === true) return [status(file.filePath, 'Change not confirmed')];
  const patch = file.structuredPatch
    .map(
      (hunk) =>
        `@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@\n${hunk.lines.join('\n')}`,
    )
    .join('\n');
  return [
    {
      path: file.filePath,
      operation: file.type ?? 'update',
      truncated: false,
      evidence:
        file.content !== undefined
          ? {
              kind: 'text',
              before: file.type === 'create' ? '' : file.originalFile,
              after: file.content,
              oldStart: 1,
              newStart: 1,
              fullContext: true,
            }
          : { kind: 'patch', patch, before: file.originalFile },
    },
  ];
}
function metadataFiles(metadata: unknown, confirmed: boolean): readonly RecordedFile[] {
  const parsed = META.safeParse(metadata);
  if (!parsed.success) return [];
  const meta = parsed.data;
  if (meta.diffs.length === 0 && meta.path !== undefined)
    return [status(meta.path, confirmed ? metadataStatus(meta.operation) : 'Change not confirmed')];
  return meta.diffs.map((diff): RecordedFile =>
    !confirmed && diff.confirmed !== true
      ? status(diff.path, 'Change not confirmed')
      : {
          path: diff.path,
          operation: meta.operation ?? 'update',
          truncated: diff.truncated === true || meta.truncated === true,
          evidence: {
            kind: 'text',
            before: diff.oldText === null && meta.operation === 'create' ? '' : diff.oldText,
            after: diff.newText,
            oldStart: diff.oldStart ?? null,
            newStart: diff.newStart ?? null,
            fullContext: false,
          },
        },
  );
}
export function recordedFiles(tool: FileToolEvidence): readonly RecordedFile[] {
  if (tool.output === null && tool.redacted)
    return inputFileStatus(tool, 'File input was redacted');
  const output = reportedRecord(tool.output);
  const confirmed = tool.state === 'done';
  const files = [
    ...metadataFiles(output?.['meta'], confirmed),
    ...claudeFile(output?.['native_result'] ?? output, confirmed),
    ...nativeFiles(output, confirmed),
  ];
  if (files.length > 0) return files;
  return inputFileStatus(tool, tool.state === 'running' ? 'Editing file…' : 'Change not confirmed');
}
function inputFileStatus(tool: FileToolEvidence, message: string): readonly RecordedFile[] {
  const input = reportedRecord(tool.input);
  const path = PATH.safeParse(input?.['file_path'] ?? input?.['path']);
  if (
    !path.success ||
    !['write', 'write_file', 'edit', 'edit_file', 'file_change'].includes(toolKey(tool.name))
  )
    return [];
  return [status(path.data, message)];
}

function nativeOperation(
  kind: z.infer<typeof CHANGES>['changes'][number]['kind'],
): RecordedFile['operation'] {
  if (nativeDestination(kind) !== null) return 'rename';
  const value = typeof kind === 'string' ? kind : kind?.type;
  return value === 'add' ? 'create' : (value ?? 'unknown');
}
function metadataStatus(operation: z.infer<typeof OPERATION> | undefined): string {
  return operation === 'create'
    ? 'File created · contents weren’t recorded'
    : 'No recorded text changes';
}

function nativePath(change: z.infer<typeof CHANGES>['changes'][number]): string {
  const destination = nativeDestination(change.kind);
  return destination === null ? change.path : `${change.path} → ${destination}`;
}
function nativeDestination(
  kind: z.infer<typeof CHANGES>['changes'][number]['kind'],
): string | null {
  if (kind === undefined || typeof kind === 'string') return null;
  return kind.move_path ?? kind.movePath ?? null;
}
