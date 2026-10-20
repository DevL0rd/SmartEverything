import { z } from 'zod';
import { CLOUD_DEVICE, IDENTIFIER, STATUS_ITEM, absentWhenEmpty } from './cloud-api';
import { TuyaResponseError, readFailure, readResult } from './envelope';
import { JSON_TEXT } from './json-text';
import {
  openPayload,
  requestHashKey,
  requestSecret,
  sealPayload,
  signRequest,
  type SmartLifeHeaders,
} from './smart-life-crypto';
import { SMART_LIFE_CLIENT_ID, type SmartLifeSession } from './smart-life-login';

export type HttpMethod = 'GET' | 'POST';

export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export const SMART_LIFE_PATHS = {
  homes: '/v1.0/m/life/users/homes',
  homeDevices: '/v1.0/m/life/ha/home/devices',
  deviceDetails: '/v1.0/m/life/ha/devices/detail',
  specification: (deviceId: string): string => `/v1.1/m/life/${deviceId}/specifications`,
  dataPointRelations: (deviceId: string): string => `/v1.0/m/life/devices/${deviceId}/status`,
  customType: (deviceId: string): string => `/v1.0/m/life/ha/${deviceId}/code/custom-type`,
  room: (deviceId: string): string => `/v1.0/m/thing/ha/${deviceId}/room`,
  commands: (deviceId: string): string => `/v1.1/m/thing/${deviceId}/commands`,
  refreshToken: (refreshToken: string): string => `/v1.0/m/token/${refreshToken}`,
  messaging: '/v1.0/m/life/ha/access/config',
  expireTerminal: '/v1.0/m/token/terminal/expire',
} as const;

export const SMART_LIFE_HOMES = z.array(z.object({ ownerId: IDENTIFIER, name: z.string() }));

export const SMART_LIFE_DEVICES = z.array(
  CLOUD_DEVICE.extend({
    uuid: absentWhenEmpty,
    status: z.array(STATUS_ITEM).default([]),
  }),
);

export type SmartLifeDevice = z.output<typeof SMART_LIFE_DEVICES>[number];

const SPECIFICATION_ITEM = z.object({
  code: z.string().min(1),
  type: z.string(),
  values: z.string(),
  name: absentWhenEmpty,
});

export const SMART_LIFE_SPECIFICATION = z.object({
  functions: z.array(SPECIFICATION_ITEM).default([]),
  status: z.array(SPECIFICATION_ITEM).default([]),
});

export type SmartLifeSpecification = z.output<typeof SMART_LIFE_SPECIFICATION>;

export const DATA_POINT_RELATIONS = z.object({
  dpStatusRelationDTOS: z.array(
    z.object({
      dpId: z.number().int().nonnegative(),
      statusFormat: z.string(),
      valueConvert: z.string(),
      valueType: z.string(),
      valueDesc: z.string(),
      enumMappingMap: z.record(z.string(), z.object({ value: z.unknown() }).partial()).nullable(),
      supportLocal: z.boolean(),
    }),
  ),
});

export type DataPointRelations = z.output<typeof DATA_POINT_RELATIONS>;

export const CUSTOM_TYPE = z
  .unknown()
  .transform((value) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value === true,
  );

export const SMART_LIFE_ROOM = z
  .object({ id: IDENTIFIER, name: z.string().min(1) })
  .nullish()
  .transform((room) => room?.name ?? null);

export const SMART_LIFE_TOKEN = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expireTime: z.number().int().positive(),
  uid: z.string().min(1),
});

export const SMART_LIFE_MESSAGING = z.object({
  url: z.string().regex(/^(ssl|tcp|mqtts?|wss?):\/\//),
  clientId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  expireTime: z.number().int().positive(),
  topic: z.object({
    ownerId: z.object({ sub: z.string().includes('{ownerId}') }),
    devId: z.object({ sub: z.string().includes('{devId}') }),
  }),
});

export type SmartLifeMessaging = z.output<typeof SMART_LIFE_MESSAGING>;

export const ANY_RESULT = z.unknown();

export interface SmartLifeCall {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: Readonly<Record<string, unknown>>;
}

export interface SmartLifeEntropy {
  readonly requestId: string;
  readonly t: number;
  readonly nonce: () => string;
}

export interface SealedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly secret: string;
}

function sealed(
  content: Readonly<Record<string, unknown>> | undefined,
  secret: string,
  nonce: () => string,
): string {
  return content === undefined || Object.keys(content).length === 0
    ? ''
    : sealPayload(JSON.stringify(content), secret, nonce());
}

export function sealRequest(
  session: SmartLifeSession,
  call: SmartLifeCall,
  entropy: SmartLifeEntropy,
): SealedRequest {
  const hashKey = requestHashKey(entropy.requestId, session.refreshToken);
  const secret = requestSecret(entropy.requestId, hashKey);
  const query = sealed(call.query, secret, entropy.nonce);
  const body = sealed(call.body, secret, entropy.nonce);
  const headers: SmartLifeHeaders = {
    'X-appKey': SMART_LIFE_CLIENT_ID,
    'X-requestId': entropy.requestId,
    'X-sid': '',
    'X-time': String(entropy.t),
    'X-token': session.accessToken,
  };
  const url = new URL(call.path, session.endpoint);
  if (query !== '') {
    url.searchParams.set('encdata', query);
  }
  return {
    url: url.toString(),
    secret,
    init: {
      method: call.method,
      headers: {
        ...headers,
        'X-sign': signRequest(hashKey, headers, query, body),
        ...(body === '' ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === '' ? {} : { body: JSON.stringify({ encdata: body }) }),
    },
  };
}

const SEALED_SUCCESS = z.object({
  success: z.literal(true),
  t: z.number().int().optional(),
  result: z.string().optional(),
});

function decoded(text: string): unknown {
  const parsed = JSON_TEXT.safeParse(text);
  return parsed.success ? parsed.data : text;
}

export interface SealedReply<T> {
  readonly value: T;
  readonly t: number | null;
}

export function readSealedReply<S extends z.ZodType>(
  operation: string,
  result: S,
  body: unknown,
  secret: string,
): SealedReply<z.output<S>> {
  readFailure(operation, body);
  const envelope = SEALED_SUCCESS.safeParse(body);
  if (!envelope.success) {
    throw new TuyaResponseError(operation, z.prettifyError(envelope.error));
  }
  const sealedResult = envelope.data.result;
  const opened =
    sealedResult === undefined || sealedResult === ''
      ? undefined
      : decoded(openPayload(sealedResult, secret));
  return { value: readResult(operation, result, opened), t: envelope.data.t ?? null };
}
