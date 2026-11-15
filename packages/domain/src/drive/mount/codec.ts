import { Decoder, Encoder } from 'cbor-x';
import { z } from 'zod';
import { decodeFrame, encodeFrame, type Frame } from './frame';
import { ERROR_META, PUSH_META, REPLY_META, REQUEST_META } from './meta';
import type {
  ErrorMeta,
  ErrorMetaInput,
  PushMeta,
  PushMetaInput,
  ReplyMeta,
  ReplyMetaInput,
  RequestMeta,
  RequestMetaInput,
} from './meta';
import { META_KEYS, XATTR_SIZE_MAX_BYTES } from './fields';
import {
  OPS,
  REQUEST_OPS,
  isPushName,
  opNameOf,
  type OpName,
  type PushName,
  type RequestOpName,
} from './ops';

export type MessageFault = 'op' | 'meta' | 'payload';

export class MessageError extends Error {
  readonly fault: MessageFault;

  constructor(fault: MessageFault, detail: string, cause?: unknown) {
    super(`Invalid drive mount message (${fault}): ${detail}`, { cause });
    this.name = 'MessageError';
    this.fault = fault;
  }
}

const OPTIONS = {
  useRecords: false,
  mapsAsObjects: false,
  tagUint8Array: false,
  variableMapSize: false,
  useTag259ForMaps: false,
  structuredClone: false,
} as const;

const encoder = new Encoder(OPTIONS);

const decoder = new Decoder(OPTIONS);

const WIRE_INT_MAX = 0xffff_ffffn;

const WIRE_INT_MIN = -0x1_0000_0000n;

const KEY_BY_NAME = new Map<string, number>(Object.entries(META_KEYS));

const NAME_BY_KEY = new Map<unknown, string>(
  Object.entries(META_KEYS).map(([name, key]) => [key, name]),
);

function wireInteger(value: bigint): bigint | number {
  return value >= WIRE_INT_MIN && value <= WIRE_INT_MAX ? Number(value) : value;
}

function safeInteger(value: bigint): bigint | number {
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : value;
}

function toWire(value: unknown): unknown {
  if (typeof value === 'bigint') return wireInteger(value);
  if (typeof value === 'number') return wireInteger(BigInt(value));
  if (Array.isArray(value)) return value.map(toWire);
  if (typeof value !== 'object' || value === null || value instanceof Uint8Array) return value;
  const entries: [number, unknown][] = [];
  for (const [name, member] of Object.entries(value)) {
    if (member === undefined) continue;
    const key = KEY_BY_NAME.get(name);
    if (key === undefined) throw new MessageError('meta', `field ${name} has no wire key`);
    entries.push([key, toWire(member)]);
  }
  return new Map(entries.sort(([left], [right]) => left - right));
}

function fromWire(value: unknown): unknown {
  if (typeof value === 'bigint') return safeInteger(value);
  if (Array.isArray(value)) return value.map(fromWire);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (!(value instanceof Map)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, member] of value) {
    const name = NAME_BY_KEY.get(key);
    if (name === undefined) throw new MessageError('meta', `key ${String(key)} is unknown`);
    out[name] = fromWire(member);
  }
  return out;
}

function parse<Schema extends z.core.$ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = z.safeParse(schema, value);
  if (!result.success) throw new MessageError('meta', result.error.message);
  return result.data;
}

export function encodeMeta<Schema extends z.core.$ZodType>(
  schema: Schema,
  value: z.input<Schema>,
): Uint8Array {
  return new Uint8Array(encoder.encode(toWire(parse(schema, value))));
}

export function decodeMeta<Schema extends z.core.$ZodType>(
  schema: Schema,
  bytes: Uint8Array,
): z.output<Schema> {
  let decoded: unknown;
  try {
    decoded = decoder.decode(bytes);
  } catch (error) {
    throw new MessageError('meta', 'the meta is not valid CBOR', error);
  }
  return parse(schema, fromWire(decoded));
}

export function decodeKeyed<
  Key extends string,
  Table extends Readonly<Record<Key, z.core.$ZodType>>,
>(table: Table, key: Key, bytes: Uint8Array): z.output<Table[Key]> {
  return decodeMeta(table[key], bytes);
}

interface Common {
  readonly requestId: bigint;
  readonly payload?: Uint8Array | null | undefined;
}

type RequestOf<Name extends RequestOpName, Meta> = {
  readonly type: 'request';
  readonly op: Name;
  readonly meta: Meta;
} & Common;

type ReplyOf<Name extends RequestOpName, Meta> = {
  readonly type: 'reply';
  readonly op: Name;
  readonly meta: Meta;
  readonly more?: boolean | undefined;
} & Common;

type ErrorOf<Name extends RequestOpName, Meta> = {
  readonly type: 'error';
  readonly op: Name;
  readonly meta: Meta;
} & Common;

type PushOf<Name extends PushName, Meta> = {
  readonly type: 'push';
  readonly op: Name;
  readonly meta: Meta;
} & Common;

export type MessageInput =
  | { [Name in RequestOpName]: RequestOf<Name, RequestMetaInput<Name>> }[RequestOpName]
  | { [Name in RequestOpName]: ReplyOf<Name, ReplyMetaInput<Name>> }[RequestOpName]
  | { [Name in RequestOpName]: ErrorOf<Name, ErrorMetaInput> }[RequestOpName]
  | { [Name in PushName]: PushOf<Name, PushMetaInput<Name>> }[PushName];

export type Message =
  | { [Name in RequestOpName]: RequestOf<Name, RequestMeta<Name>> }[RequestOpName]
  | { [Name in RequestOpName]: ReplyOf<Name, ReplyMeta<Name>> }[RequestOpName]
  | { [Name in RequestOpName]: ErrorOf<Name, ErrorMeta> }[RequestOpName]
  | { [Name in PushName]: PushOf<Name, PushMeta<Name>> }[PushName];

const REQUEST_SCHEMAS: Readonly<Record<RequestOpName, z.ZodType>> = REQUEST_META;

const REPLY_SCHEMAS: Readonly<Record<RequestOpName, z.ZodType>> = REPLY_META;

const PUSH_SCHEMAS: Readonly<Record<PushName, z.ZodType>> = PUSH_META;

function schemaFor(type: Frame['type'], name: OpName): z.ZodType {
  if (isPushName(name)) return PUSH_SCHEMAS[name];
  if (type === 'error') return ERROR_META;
  return type === 'request' ? REQUEST_SCHEMAS[name] : REPLY_SCHEMAS[name];
}

function payloadRequired(type: Frame['type'], name: OpName): boolean {
  if (type === 'error' || isPushName(name)) return false;
  const definition = REQUEST_OPS[name];
  return type === 'request' ? definition.requestPayload : definition.replyPayload;
}

const XATTR_VALUE_OPS: readonly OpName[] = ['SETXATTR', 'GETXATTR'];

function checkPayloadSize(name: OpName, meta: unknown, payload: Uint8Array): void {
  if (XATTR_VALUE_OPS.includes(name) && payload.length > XATTR_SIZE_MAX_BYTES) {
    throw new MessageError('payload', 'an xattr value exceeds the size limit');
  }
  if (name === 'PUT' && REQUEST_META.PUT.parse(meta).size !== payload.length) {
    throw new MessageError('payload', 'PUT size differs from the payload length');
  }
}

function checkPayload(
  type: Frame['type'],
  name: OpName,
  meta: unknown,
  payload: Uint8Array | null,
): void {
  const required = payloadRequired(type, name);
  if (required !== (payload !== null)) {
    throw new MessageError(
      'payload',
      required ? `${name} needs a payload` : `${name} takes no payload`,
    );
  }
  if (payload !== null) checkPayloadSize(name, meta, payload);
}

const VALIDATED_MESSAGE = z.custom<Message>();

export function encodeMessage(message: MessageInput): Uint8Array {
  const { type, op: name } = message;
  const payload = message.payload ?? null;
  const meta = parse(schemaFor(type, name), message.meta);
  checkPayload(type, name, meta, payload);
  return encodeFrame({
    type,
    op: OPS[name].code,
    requestId: message.requestId,
    more: type === 'reply' && message.more === true,
    meta: new Uint8Array(encoder.encode(toWire(meta))),
    payload,
  });
}

export function decodeMessage(bytes: Uint8Array): Message {
  const frame = decodeFrame(bytes);
  const name = opNameOf(frame.op);
  if (name === undefined) throw new MessageError('op', `code ${String(frame.op)} is unknown`);
  if ((frame.type === 'push') !== isPushName(name)) {
    throw new MessageError('op', `${name} cannot be carried by a ${frame.type} frame`);
  }
  const meta = decodeMeta(schemaFor(frame.type, name), frame.meta);
  checkPayload(frame.type, name, meta, frame.payload);
  return VALIDATED_MESSAGE.parse({
    type: frame.type,
    op: name,
    requestId: frame.requestId,
    meta,
    payload: frame.payload,
    ...(frame.type === 'reply' ? { more: frame.more } : {}),
  });
}
