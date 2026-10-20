import type { JsonValue } from '@smarteverything/domain';
import type { DataPoint } from './data-points';
import {
  parseHeadKey,
  pulsesFromBase64,
  pulsesToBase64,
  type IrCode,
} from './ir-codes';

export interface DataPointRef {
  readonly code: string;
  readonly dpId: number;
}

export interface DataPointWrite {
  readonly code: string;
  readonly dpId: number | null;
  readonly value: JsonValue;
}

export type IrScheme =
  | { readonly kind: 'dp201'; readonly send: DataPointRef; readonly learned: DataPointRef }
  | {
      readonly kind: 'dp1';
      readonly control: DataPointRef;
      readonly learned: DataPointRef;
      readonly head: DataPointRef;
      readonly key: DataPointRef;
      readonly study: DataPointRef;
      readonly codeType: DataPointRef;
    };

export type IrAction =
  | { readonly kind: 'study_start' }
  | { readonly kind: 'study_exit' }
  | { readonly kind: 'send'; readonly code: IrCode };

const LEGACY_SEND = 201;

const MODERN_CONTROL = 1;

function refTo(points: readonly DataPoint[], dpId: number, standardCode: string): DataPointRef {
  const point = points.find((candidate) => candidate.dpId === dpId);
  return { code: point === undefined ? standardCode : point.code, dpId };
}

export function irSchemeOf(
  points: readonly DataPoint[],
  observedDpIds: ReadonlySet<number>,
): IrScheme | null {
  const has = (dpId: number): boolean =>
    observedDpIds.has(dpId) || points.some((point) => point.dpId === dpId);
  if (has(LEGACY_SEND)) {
    return {
      kind: 'dp201',
      send: refTo(points, LEGACY_SEND, 'ir_send'),
      learned: refTo(points, 202, 'ir_study_code'),
    };
  }
  if (has(MODERN_CONTROL)) {
    return {
      kind: 'dp1',
      control: refTo(points, MODERN_CONTROL, 'control'),
      learned: refTo(points, 2, 'study_code'),
      head: refTo(points, 3, 'ir_code'),
      key: refTo(points, 4, 'key_code'),
      study: refTo(points, 7, 'key_study'),
      codeType: refTo(points, 13, 'type'),
    };
  }
  return null;
}

function write(ref: DataPointRef, value: JsonValue): DataPointWrite {
  return { code: ref.code, dpId: ref.dpId, value };
}

function legacySend(code: IrCode): Readonly<Record<string, string | number>> {
  if (code.format === 'pulses') {
    return { control: 'send_ir', type: 0, head: '', key1: `1${code.code}` };
  }
  const headKey = parseHeadKey(code.code);
  return { control: 'send_ir', type: 0, head: headKey.head, key1: `0${headKey.key}` };
}

function legacyWrites(
  scheme: Extract<IrScheme, { kind: 'dp201' }>,
  action: IrAction,
): readonly DataPointWrite[] {
  switch (action.kind) {
    case 'study_start':
      return [write(scheme.send, JSON.stringify({ control: 'study' }))];
    case 'study_exit':
      return [write(scheme.send, JSON.stringify({ control: 'study_exit' }))];
    case 'send':
      return [write(scheme.send, JSON.stringify(legacySend(action.code)))];
  }
}

function modernSend(
  scheme: Extract<IrScheme, { kind: 'dp1' }>,
  code: IrCode,
): readonly DataPointWrite[] {
  if (code.format === 'pulses') {
    return [
      write(scheme.control, 'study_key'),
      write(scheme.codeType, 0),
      write(scheme.study, code.code),
    ];
  }
  const headKey = parseHeadKey(code.code);
  return [
    write(scheme.control, 'send_ir'),
    write(scheme.codeType, 0),
    write(scheme.head, headKey.head),
    write(scheme.key, headKey.key),
  ];
}

function modernWrites(
  scheme: Extract<IrScheme, { kind: 'dp1' }>,
  action: IrAction,
): readonly DataPointWrite[] {
  switch (action.kind) {
    case 'study_start':
      return [write(scheme.control, 'study')];
    case 'study_exit':
      return [write(scheme.control, 'study_exit')];
    case 'send':
      return modernSend(scheme, action.code);
  }
}

export function irWrites(scheme: IrScheme, action: IrAction): readonly DataPointWrite[] {
  return scheme.kind === 'dp201' ? legacyWrites(scheme, action) : modernWrites(scheme, action);
}

export function learnedCode(
  scheme: IrScheme,
  field: string | number,
  value: unknown,
): IrCode | null {
  const matches =
    typeof field === 'number' ? field === scheme.learned.dpId : field === scheme.learned.code;
  if (!matches || typeof value !== 'string' || value === '') {
    return null;
  }
  return { format: 'pulses', code: pulsesToBase64(pulsesFromBase64(value)) };
}
