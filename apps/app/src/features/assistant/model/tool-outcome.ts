import type { ChatTimelineTool } from '@smarteverything/domain';
import { z } from 'zod';
import { readableToolLine, reportedLine, reportedRecord, toolKey } from './tool-presentation-text';

const RECORD = z.record(z.string(), z.unknown());
const TEXT_CONTENT = z.object({ type: z.literal('text'), text: z.string() });
const MAX_RESULT_DEPTH = 4;
const MAX_RESULT_RECORDS = 32;
interface ResultEnvelope {
  readonly value: unknown;
  readonly depth: number;
}

function resultRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value === 'string') return reportedRecord(value);
  const parsed = RECORD.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resultChildren(
  record: Readonly<Record<string, unknown>>,
  depth: number,
): readonly ResultEnvelope[] {
  const children: ResultEnvelope[] = [];
  for (const key of ['result', 'data']) {
    if (record[key] !== undefined) children.push({ value: record[key], depth });
  }
  const content = record['content'];
  if (!Array.isArray(content)) return children;
  for (const entry of content.slice(0, MAX_RESULT_RECORDS)) {
    const parsed = TEXT_CONTENT.safeParse(entry);
    if (parsed.success) children.push({ value: parsed.data.text, depth });
  }
  return children;
}

function outputRecords(text: string | null): readonly Readonly<Record<string, unknown>>[] {
  const records: Readonly<Record<string, unknown>>[] = [];
  const queue: ResultEnvelope[] = [{ value: text, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_RESULT_RECORDS) {
    const envelope = queue.shift();
    if (envelope === undefined) break;
    visited += 1;
    const record = resultRecord(envelope.value);
    if (record === null) continue;
    records.push(record);
    if (envelope.depth < MAX_RESULT_DEPTH)
      queue.push(...resultChildren(record, envelope.depth + 1));
  }
  return records;
}

function exitCode(output: Readonly<Record<string, unknown>> | null): number | null {
  if (output === null) return null;
  const code = output['exit_code'] ?? output['exitCode'];
  return typeof code === 'number' ? code : null;
}

function resultFailed(output: Readonly<Record<string, unknown>> | null): boolean {
  if (output === null) return false;
  const code = exitCode(output);
  if (code !== null && code !== 0) return true;
  if (['failed', 'error'].includes(String(output['status']))) return true;
  if ([output['isError'], output['is_error']].includes(true)) return true;
  if ([output['success'], output['ok']].includes(false)) return true;
  return output['error'] !== undefined && output['error'] !== null && output['error'] !== false;
}

const RECORDS = new WeakMap<ChatTimelineTool, readonly Readonly<Record<string, unknown>>[]>();
const DONE_OUTCOMES = new WeakMap<ChatTimelineTool, ChatTimelineTool['state']>();

function recordsOf(tool: ChatTimelineTool): readonly Readonly<Record<string, unknown>>[] {
  const cached = RECORDS.get(tool);
  if (cached !== undefined) return cached;
  const records = outputRecords(tool.output);
  RECORDS.set(tool, records);
  return records;
}

export function toolOutcome(tool: ChatTimelineTool, live: boolean): ChatTimelineTool['state'] {
  if (tool.state === 'running') return live ? 'running' : 'unknown';
  if (tool.state !== 'done') return tool.state;
  const cached = DONE_OUTCOMES.get(tool);
  if (cached !== undefined) return cached;
  const outcome = doneOutcome(tool);
  DONE_OUTCOMES.set(tool, outcome);
  return outcome;
}

function doneOutcome(tool: ChatTimelineTool): ChatTimelineTool['state'] {
  const records = recordsOf(tool);
  if (
    records.some((record) =>
      ['declined', 'interrupted', 'cancelled', 'stopped'].includes(String(record['status'])),
    )
  )
    return 'interrupted';
  if (records.some(resultFailed)) return 'failed';
  if (toolKey(tool.name) === 'file_change' && records[0]?.['status'] !== 'completed')
    return 'unknown';
  return 'done';
}

function failureOutput(tool: ChatTimelineTool): Readonly<Record<string, unknown>> | null {
  const records = recordsOf(tool);
  return records.find(resultFailed) ?? records[0] ?? null;
}

function failureLine(tool: ChatTimelineTool): string | null {
  const output = failureOutput(tool);
  const error = RECORD.safeParse(output?.['error']);
  const message = reportedLine(error.success ? error.data : output, [
    'error',
    'message',
    'summary',
  ]);
  if (message !== null) return message;
  const text = tool.output ?? tool.detail ?? '';
  if (/permission denied|access denied|not permitted/i.test(text)) return 'Access was denied.';
  if (/no such file|file not found|does not exist/i.test(text))
    return 'The file could not be found.';
  if (/timed? out|timeout/i.test(text)) return 'The action took too long to finish.';
  const code = exitCode(output);
  return code === null
    ? readableToolLine(tool.detail)
    : `The command exited with code ${String(code)}.`;
}

function countLine(output: Readonly<Record<string, unknown>> | null): string | null {
  if (output === null) return null;
  const labels = ['rooms', 'devices', 'files', 'matches', 'results', 'images'];
  const counts = labels.flatMap((label) => {
    const entries = output[label];
    return Array.isArray(entries) ? [`${String(entries.length)} ${label}`] : [];
  });
  return counts.length === 0 ? null : counts.slice(0, 3).join(' · ');
}

export function toolResultLine(tool: ChatTimelineTool, live: boolean): string | null {
  const state = toolOutcome(tool, live);
  if (state === 'failed') return failureLine(tool);
  if (state === 'interrupted') return 'This action stopped before its result was confirmed.';
  if (state === 'unknown') return 'The result could not be confirmed.';
  if (state === 'running') return null;
  if (tool.image_operation_id !== null)
    return 'The image request finished. Its result appears below.';
  const result = recordsOf(tool)
    .map((record) => reportedLine(record, ['summary', 'line', 'message']) ?? countLine(record))
    .find((line) => line !== null);
  return result ?? meaningfulDetail(tool.detail);
}

function meaningfulDetail(detail: string | null): string | null {
  if (detail !== null && /native .*tool|tool (?:call|result)|^done$|^success$/i.test(detail))
    return null;
  return readableToolLine(detail);
}
