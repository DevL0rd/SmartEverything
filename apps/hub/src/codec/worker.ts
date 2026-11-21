import { parentPort, workerData } from 'node:worker_threads';
import { API_ENDPOINTS, type EndpointShape } from '@smarteverything/domain';
import { Logger, messageOf, shippedRecord } from '@smarteverything/logging';
import type { z } from 'zod';
import { INFERENCE } from '../harness/inference-request';
import { prepareGlb } from '../models/glb-lod';
import { IcalParseError } from '../planner/ical/model';
import { readCalendar } from '../planner/ical/read';
import { issuesOf } from '../server/issues';
import { checkedResponse } from '../server/responses/check';
import {
  CODEC_DATA,
  CODEC_REQUEST,
  type CodecJob,
  type CodecReply,
  type FromCodec,
} from './protocol';

const port = parentPort;
if (port === null) throw new Error('The codec worker needs a parent port.');
const data = CODEC_DATA.parse(workerData);
const post = (message: FromCodec): void => {
  port.postMessage(message);
};

Logger.configure({
  level: data.level,
  context: { platform: 'server', release: data.release },
  sink: (record) => {
    if (record.level !== 'none') post({ kind: 'log', record: shippedRecord(record, 'server') });
  },
});

const ENDPOINTS: ReadonlyMap<string, EndpointShape> = new Map(Object.entries(API_ENDPOINTS));

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Answer = WithoutId<CodecReply>;

class UnknownEndpointError extends Error {
  override readonly name = 'UnknownEndpointError';
}

function endpointOf(name: string): EndpointShape {
  const endpoint = ENDPOINTS.get(name);
  if (endpoint === undefined) throw new UnknownEndpointError(`No endpoint is named ${name}.`);
  return endpoint;
}

function encoded(endpoint: EndpointShape, text: string, member: boolean): Answer {
  const value: unknown = JSON.parse(text);
  const check = checkedResponse(endpoint, value, member);
  return check.valid
    ? { kind: 'encoded', text: JSON.stringify(check.value) }
    : { kind: 'invalid', issueCodes: [...check.issueCodes] };
}

function parsedJson(bytes: Uint8Array): { readonly json: true; readonly value: unknown } | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return { json: true, value };
  } catch (cause) {
    if (cause instanceof SyntaxError) return null;
    throw cause;
  }
}

function decodedBody(schema: z.ZodType, bytes: Uint8Array): Answer {
  const parsed = parsedJson(bytes);
  if (parsed === null) return { kind: 'body_not_json' };
  const body = schema.safeParse(parsed.value);
  return body.success
    ? { kind: 'body', value: body.data }
    : { kind: 'body_invalid', detail: issuesOf(body.error) };
}

function calendarOf(text: string, defaultZone: string): Answer {
  try {
    return { kind: 'calendar', calendar: readCalendar(text, { defaultZone }) };
  } catch (cause) {
    if (cause instanceof IcalParseError)
      return { kind: 'calendar_unreadable', reason: cause.reason };
    throw cause;
  }
}

async function glbOf(bytes: Uint8Array): Promise<Answer> {
  const prepared = await prepareGlb(bytes);
  return prepared.ok
    ? { kind: 'glb', triangles: prepared.triangles, levels: [...prepared.levels] }
    : { kind: 'glb_refused', stage: prepared.stage, problem: prepared.problem };
}

async function answered(job: CodecJob): Promise<Answer> {
  switch (job.kind) {
    case 'response':
      return encoded(endpointOf(job.endpoint), job.text, job.member);
    case 'body':
      return decodedBody(endpointOf(job.endpoint).body, job.bytes);
    case 'inference':
      return decodedBody(INFERENCE, job.bytes);
    case 'calendar':
      return calendarOf(job.text, job.defaultZone);
    case 'glb':
      return glbOf(job.bytes);
  }
}

port.on('message', (raw: unknown) => {
  const request = CODEC_REQUEST.parse(raw);
  answered(request.job).then(
    (answer) => {
      post({ ...answer, id: request.id });
    },
    (cause: unknown) => {
      post({ id: request.id, kind: 'failed', message: messageOf(cause) });
    },
  );
});
