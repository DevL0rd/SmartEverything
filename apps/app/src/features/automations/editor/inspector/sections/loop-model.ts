import type { FlowNode, JsonValue, LoopLimit, NodeKind, PortValue } from '@smarteverything/domain';
import { LOOP_LIMIT } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { portOps } from './edits';

export interface LoopLimitView {
  readonly gap: number | undefined;
  readonly gapCaption: string;
  readonly showsPasses: boolean;
  readonly passes: number | undefined;
  readonly time: number | undefined;
  readonly onLimit: LoopLimit['onLimit'];
  readonly note: string | undefined;
}

interface LoopCopy {
  readonly gapCaption: string;
  readonly showsPasses: boolean;
}

const LOOP_COPY: Readonly<Record<string, LoopCopy>> = {
  'flow.repeat': { gapCaption: 'Not after the last pass', showsPasses: false },
  'flow.do_until': { gapCaption: 'Not after the last pass', showsPasses: true },
  'flow.while': { gapCaption: 'Before checking again', showsPasses: true },
  'flow.forever': { gapCaption: 'Before the next pass', showsPasses: true },
};

export const LIMIT_START_PASSES = 1000;
export const LIMIT_START_TIME_MS = 3_600_000;

export const TIME_LIMIT_CAPTION = 'Stops the loop even in the middle of a pass';

export const PASS_LIMIT_CAPTION = 'Stops the loop after this many passes';

export function hasLoopLimits(kind: NodeKind | undefined): boolean {
  return kind !== undefined && Object.hasOwn(LOOP_COPY, kind.id);
}

function literalOf(value: PortValue | undefined): JsonValue | undefined {
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function storedLimit(node: FlowNode): LoopLimit | undefined {
  const parsed = LOOP_LIMIT.safeParse(literalOf(node.ports?.['limit']));
  return parsed.success ? parsed.data : undefined;
}

export function loopLimitView(node: FlowNode, kindId: string): LoopLimitView {
  const copy = LOOP_COPY[kindId] ?? { gapCaption: '', showsPasses: false };
  const stored = storedLimit(node);
  const gap = literalOf(node.ports?.['gap']);
  return {
    gap: typeof gap === 'number' ? gap : undefined,
    gapCaption: copy.gapCaption,
    showsPasses: copy.showsPasses,
    passes: stored?.iterations,
    time: stored?.time,
    onLimit: stored?.onLimit ?? 'fail',
    note: stored?.note,
  };
}

export interface LimitChange {
  readonly iterations?: number | undefined;
  readonly time?: number | undefined;
  readonly onLimit?: LoopLimit['onLimit'];
  readonly note?: string | undefined;
}

export function isLimited(view: LoopLimitView): boolean {
  return view.passes !== undefined || view.time !== undefined;
}

export function nextLimit(view: LoopLimitView, change: LimitChange): LoopLimit | null {
  const merged = {
    iterations: view.passes,
    time: view.time,
    onLimit: view.onLimit,
    note: view.note,
    ...change,
  };
  if (merged.iterations === undefined && merged.time === undefined) return null;
  return {
    onLimit: merged.onLimit,
    ...(merged.iterations === undefined ? {} : { iterations: merged.iterations }),
    ...(merged.time === undefined ? {} : { time: merged.time }),
    ...(merged.note === undefined || merged.note === '' ? {} : { note: merged.note }),
  };
}

function limitLiteral(limit: LoopLimit): Record<string, JsonValue> {
  const literal: Record<string, JsonValue> = { onLimit: limit.onLimit };
  if (limit.iterations !== undefined) literal['iterations'] = limit.iterations;
  if (limit.time !== undefined) literal['time'] = limit.time;
  if (limit.note !== undefined) literal['note'] = limit.note;
  return literal;
}

export function limitOps(key: string, limit: LoopLimit | null): readonly PatchOp[] {
  return portOps(key, 'limit', limit === null ? null : { lit: limitLiteral(limit) });
}

export function gapOps(key: string, gap: number | null): readonly PatchOp[] {
  return portOps(key, 'gap', gap === null ? null : { lit: gap });
}

export interface ForEachView {
  readonly together: boolean;
  readonly width: number;
  readonly most: number;
  readonly collecting: boolean;
  readonly reversed: boolean;
}

const SERIAL = 1;

export function forEachView(node: FlowNode, kind: NodeKind): ForEachView {
  const declared = kind.inputs.find((input) => input.name === 'concurrency')?.type;
  const most =
    declared?.t === 'number' && declared.max !== undefined ? declared.max : Number.MAX_SAFE_INTEGER;
  const stored = literalOf(node.ports?.['concurrency']);
  const width = typeof stored === 'number' ? stored : SERIAL;
  return {
    together: width > SERIAL,
    width,
    most,
    collecting: node.ports?.['collect'] !== undefined,
    reversed: literalOf(node.ports?.['reverse']) === true,
  };
}

export const DEFAULT_TOGETHER_WIDTH = 4;

export function concurrencyOps(key: string, width: number): readonly PatchOp[] {
  return portOps(key, 'concurrency', width <= SERIAL ? null : { lit: width });
}

export function breakTarget(node: FlowNode): string | undefined {
  const target = literalOf(node.ports?.['target']);
  return typeof target === 'string' && target !== '' ? target : undefined;
}

export function targetOps(key: string, target: string | undefined): readonly PatchOp[] {
  return portOps(key, 'target', target === undefined ? null : { lit: target });
}

export const LOOP_EXIT_KINDS = [
  { kind: 'flow.break', label: 'Break (leave the loop)' },
  { kind: 'flow.continue', label: 'Continue (next item)' },
] as const;

export function returnExit(node: FlowNode): string | undefined {
  const exit = literalOf(node.ports?.['exit']);
  return typeof exit === 'string' && exit !== '' ? exit : undefined;
}

export function exitOps(key: string, exit: string): readonly PatchOp[] {
  return portOps(key, 'exit', { lit: exit });
}
