import { isDeepStrictEqual } from 'node:util';
import {
  adoptSessionEvent,
  isSurfaceEligibleType,
  KNOWN_SESSION_EVENT_TYPES,
} from '@deepseek-ai/dsh-session';
import { z } from 'zod';
import { DSH_SESSION_EVENT_WRITE, JSON_VALUE, type DshSessionEvent } from '@smarteverything/domain';
import { DshSessionStorageError } from './dsh-session-errors';
import { messageOf } from '@smarteverything/logging';

const ADOPT = z.function({ input: [z.unknown()], output: z.unknown() }).parse(adoptSessionEvent);
const REPLACE = z.strictObject({
  op: z.literal('replace'),
  startSeq: z.int().nonnegative(),
  endSeq: z.int().nonnegative(),
});
const SOURCES = z.array(z.int().nonnegative());
const DATA = z.record(z.string(), JSON_VALUE);
const DEVELOPER = z.object({
  headerSeq: z.int().nonnegative(),
  message: z.object({
    content: z.array(z.object({ type: z.string(), toolName: z.string().optional() })),
  }),
});
const HEADER = z.object({
  header: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), JSON_VALUE),
        deferLoading: z.literal(true).optional(),
      }),
    ),
  }),
});

export interface SurfaceTail {
  readonly nodes: number[];
}

export type EventAt = (seq: number) => DshSessionEvent | undefined;

export interface AppendSource {
  readonly sessionId: string;
  readonly from: number;
  readonly events: readonly DshSessionEvent[];
  readonly stored: EventAt;
}

export interface SurfaceRow {
  readonly seq: number;
  readonly type: string;
  readonly op: string | null;
}

export function surfaceTailOf(rows: readonly SurfaceRow[]): SurfaceTail {
  const tail: SurfaceTail = { nodes: [] };
  for (const row of rows) {
    if (!isSurfaceEligibleType(row.type)) continue;
    if (row.op === 'append') {
      tail.nodes.push(row.seq);
      continue;
    }
    const operation = REPLACE.parse(JSON.parse(row.op ?? 'null'));
    const start = tail.nodes.indexOf(operation.startSeq);
    const end = tail.nodes.indexOf(operation.endSeq);
    if (start < 0 || end < start)
      throw new Error(`stored surface replacement ${String(row.seq)} names no current range`);
    tail.nodes.splice(start, end - start + 1, row.seq);
  }
  return tail;
}

export function validateNativeAppend(source: AppendSource, tail: SurfaceTail): void {
  const at: EventAt = (seq) =>
    seq >= source.from ? source.events[seq - source.from] : source.stored(seq);
  try {
    for (const candidate of source.events) {
      const event = DSH_SESSION_EVENT_WRITE.parse(candidate);
      if (!KNOWN_SESSION_EVENT_TYPES.has(event.type) && event.ignorable !== true)
        throw new Error(`unknown required native event type ${event.type}`);
      ADOPT(event);
      validateDeveloperHeader(event, at);
      advanceSurface(event, tail, at);
    }
  } catch (cause) {
    throw new DshSessionStorageError(
      source.sessionId,
      'corruption',
      `native event admission failed: ${messageOf(cause)}`,
    );
  }
}

function validateDeveloperHeader(event: DshSessionEvent, at: EventAt): void {
  if (event.type !== 'developer/message') return;
  const candidate = DEVELOPER.safeParse(event.data);
  if (!candidate.success) return;
  const data = candidate.data;
  const request = at(data.headerSeq);
  if (request?.type !== 'request/header' || data.headerSeq >= event.seq)
    throw new Error('developer headerSeq must reference an earlier request/header');
  const header = HEADER.parse(request.data);
  for (const block of data.message.content) {
    if (block.type !== 'tool-addition') continue;
    const definitions = header.header.tools.filter((tool) => tool.name === block.toolName);
    if (definitions.length !== 1)
      throw new Error(
        'a developer tool addition must name exactly one complete historical tool definition',
      );
  }
}

function advanceSurface(event: DshSessionEvent, tail: SurfaceTail, at: EventAt): void {
  if (!isSurfaceEligibleType(event.type)) return;
  if (event.surfaceOp === 'append') {
    tail.nodes.push(event.seq);
    return;
  }
  const operation = REPLACE.parse(event.surfaceOp);
  const start = tail.nodes.indexOf(operation.startSeq);
  const end = tail.nodes.indexOf(operation.endSeq);
  if (start < 0 || end < start)
    throw new Error('a surface replacement must name an ordered current surface range');
  const shadowed = tail.nodes.slice(start, end + 1);
  const sources = new Set(SOURCES.parse(event.sourceEventSeqs));
  if (shadowed.some((seq) => !sources.has(seq)))
    throw new Error('a surface replacement must cite every shadowed surface node');
  validateReplacementIdentity(event, shadowed, start, at);
  tail.nodes.splice(start, shadowed.length, event.seq);
}

function validateReplacementIdentity(
  event: DshSessionEvent,
  shadowed: readonly number[],
  start: number,
  at: EventAt,
): void {
  const first = shadowed[0];
  if (first === undefined) throw new Error('a surface replacement must shadow at least one node');
  const original = at(first);
  if (start === 0 && original?.type === 'system/message') validateSystemHead(event, shadowed);
  validateToolResultReplacement(event, shadowed, original);
}

function validateSystemHead(event: DshSessionEvent, shadowed: readonly number[]): void {
  if (event.type !== 'system/message' || shadowed.length !== 1) {
    throw new Error('the system surface head can only be replaced by one system message');
  }
}

function validateToolResultReplacement(
  event: DshSessionEvent,
  shadowed: readonly number[],
  original: DshSessionEvent | undefined,
): void {
  if (event.type !== 'tool/result') return;
  if (shadowed.length !== 1 || original?.type !== 'tool/result')
    throw new Error('a tool result replacement must shadow one current tool result');
  if (!isDeepStrictEqual(toolResultIdentity(original), toolResultIdentity(event)))
    throw new Error('a tool result replacement may only change content');
}

function toolResultIdentity(event: DshSessionEvent): Readonly<Record<string, unknown>> {
  const data = DATA.parse(event.data);
  const message = DATA.parse(data['message']);
  return { ...data, message: { ...message, content: null } };
}
