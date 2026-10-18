import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { z } from 'zod';
import type { Params } from './catalogue';

export type Reply = Readonly<Record<string, unknown>>;

export interface Turn {
  readonly queryText: string;
  readonly index: number;
}

export interface Speech extends Turn {
  readonly text: string;
  readonly url: string;
}

export interface Answer {
  readonly text: string;
  readonly url: string;
}

interface Envelope {
  readonly turn: Turn;
  readonly behavior: string;
  readonly intent: string;
  readonly params: unknown;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly indexed?: boolean;
}

const GOODBYE = 'Goodbye';

const HTTP_OK = 200;
export const FRAMING_HEADERS: ReadonlySet<string> = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'transfer-encoding',
]);

function envelope({ turn, behavior, intent, params, extra = {}, indexed = true }: Envelope): Reply {
  return {
    queryId: randomUUID(),
    queryResult: {
      resultCode: randomUUID(),
      queryText: turn.queryText,
      intent: { name: intent, confidence: 1 },
      rec_behavior: behavior,
      behavior_paras: params,
      ...extra,
    },
    languageCode: 'en',
    ...(indexed ? { index: turn.index } : {}),
  };
}

function speechParams(text: string, url: string): Reply {
  return {
    txt: text,
    url,
    pre_animation: '',
    post_animation: '',
    post_behavior: '',
    sentiment: '',
    listen: 0,
  };
}

export function speak(speech: Speech): Reply {
  return envelope({
    turn: speech,
    behavior: 'interact_speak',
    intent: 'local_ai_speak',
    params: speechParams(speech.text, speech.url),
  });
}

export function photoAnswer(speech: Speech): Reply {
  return envelope({
    turn: speech,
    behavior: 'interact_speak',
    intent: 'chatgpt_speak',
    params: speechParams(speech.text, speech.url),
    extra: { photo_type: '' },
    indexed: false,
  });
}

export function act(turn: Turn, behavior: string, params: Params): Reply {
  return envelope({
    turn,
    behavior,
    intent: behavior,
    params: Object.keys(params).length > 0 ? params : [],
  });
}

export function chatMode(turn: Turn, type: 'connect' | 'quit', answer?: Answer): Reply {
  const heard = type === 'quit' && turn.queryText === '' ? { ...turn, queryText: GOODBYE } : turn;
  return envelope({
    turn: heard,
    behavior: 'ability_chatgpt',
    intent: 'ability_chatgpt',
    params: answer === undefined ? { type } : { type, txt: answer.text, url: answer.url },
  });
}

export function recognize(turn: Turn): Reply {
  return envelope({
    turn,
    behavior: 'interact_recognize',
    intent: 'ability_photo_recog',
    params: [],
  });
}

export function tagged(responsetag: string, extra: Reply = {}): Reply {
  return { errcode: 0, errmsg: 'OK', responsetag, ...extra };
}

export function permission(): Reply {
  return tagged('permission', { permission: true });
}

export function chatStart(url: string): Reply {
  return { errcode: 0, url, errmsg: 'OK', responsetag: 'chatstart' };
}

export function failed(responsetag: string, errmsg: string): Reply {
  return { errcode: 500, errmsg, responsetag };
}

export interface Payload {
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
}

export interface Response extends Payload {
  readonly status: number;
}

export function encode(
  status: number,
  body: Buffer | Reply,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8');
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: payload,
  };
}

export function ok(body: Buffer | Reply, headers?: Readonly<Record<string, string>>): Response {
  return encode(HTTP_OK, body, headers);
}

export function flatHeaders(headers: IncomingHttpHeaders): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : (value ?? ''),
    ]),
  );
}

export function relay(response: Response): Response {
  return {
    ...response,
    headers: Object.fromEntries(
      Object.entries(response.headers).filter(([name]) => !FRAMING_HEADERS.has(name)),
    ),
  };
}

export function decodedBody(payload: Payload): Buffer {
  const encoding = (payload.headers['content-encoding'] ?? '').toLowerCase();
  if (encoding.includes('gzip')) {
    return gunzipSync(payload.body);
  }
  if (encoding.includes('deflate')) {
    return inflateSync(payload.body);
  }
  return encoding.includes('br') ? brotliDecompressSync(payload.body) : payload.body;
}

const CLOUD_REPLY = z.looseObject({
  url: z.string().optional(),
  queryResult: z
    .looseObject({
      queryText: z.string().optional(),
      rec_behavior: z.string().optional(),
      behavior_paras: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
    })
    .optional(),
});

export interface Summary {
  readonly queryText: string;
  readonly text: string;
  readonly behavior: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly url: string;
}

function paramsOf(
  result: z.output<typeof CLOUD_REPLY>['queryResult'],
): Readonly<Record<string, unknown>> {
  const raw = result?.behavior_paras;
  return raw === undefined || Array.isArray(raw) ? {} : raw;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function summarize(json: unknown): Summary | null {
  const parsed = CLOUD_REPLY.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  const result = parsed.data.queryResult;
  const params = paramsOf(result);
  return {
    queryText: result?.queryText ?? '',
    text: textOf(params['txt']),
    behavior: result?.rec_behavior ?? '',
    params,
    url: textOf(params['url']) || (parsed.data.url ?? ''),
  };
}
