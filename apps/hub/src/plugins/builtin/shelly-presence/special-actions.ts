import {
  JSON_VALUE,
  SHELLY_SCRIPT_STATUS,
  type JsonValue,
  type ShellyPresenceAction,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ShellyRpc } from './rpc';
import { supportedMethod } from './action-plan';
import { shellyPasswordHash } from './rpc-auth';

const SCRIPT_CHUNK = 1024;
const SCRIPT_BYTES = 65536;
const CODE_CHUNK = z.object({ data: z.string().max(SCRIPT_BYTES), left: z.int().nonnegative() });
const CERT_METHODS = {
  user_ca: 'Shelly.PutUserCA',
  tls_client_cert: 'Shelly.PutTLSClientCert',
  tls_client_key: 'Shelly.PutTLSClientKey',
  http_server_cert: 'Shelly.PutHTTPServerCert',
  http_server_key: 'Shelly.PutHTTPServerKey',
  http_server_ca: 'Shelly.PutHTTPServerCABundle',
} as const;
export async function specialShellyAction(
  rpc: ShellyRpc,
  methods: readonly string[],
  id: string,
  action: ShellyPresenceAction,
): Promise<JsonValue | undefined> {
  if (action.action === 'script_code') return readCode(rpc, methods, action.id);
  if (action.action === 'script_put_code')
    return writeChunks(rpc, supportedMethod(methods, 'Script.PutCode'), {
      base: { id: action.id },
      field: 'code',
      content: action.code,
      append: action.append,
    });
  if (action.action === 'certificate_put')
    return writeChunks(rpc, supportedMethod(methods, CERT_METHODS[action.target]), {
      base: {},
      field: 'data',
      content: action.data,
      append: action.append ?? false,
    });
  if (action.action === 'device_password')
    return rpc.call(
      supportedMethod(methods, 'Shelly.SetAuth'),
      {
        user: 'admin',
        realm: id,
        ha1: action.password === null ? null : shellyPasswordHash(id, action.password),
      },
      JSON_VALUE,
    );
  return undefined;
}
async function readCode(
  rpc: ShellyRpc,
  methods: readonly string[],
  id: number,
): Promise<JsonValue> {
  const method = supportedMethod(methods, 'Script.GetCode');
  let code = '';
  let offset = 0;
  for (let page = 0; page < 65; page += 1) {
    const result = await rpc.call(method, { id, offset, len: SCRIPT_CHUNK }, CODE_CHUNK);
    code += result.data;
    offset += Buffer.byteLength(result.data);
    if (offset > SCRIPT_BYTES)
      throw new Error('The script exceeds the supported 65536-byte source limit.');
    if (result.left === 0)
      return {
        code,
        status: await rpc
          .call(supportedMethod(methods, 'Script.GetStatus'), { id }, SHELLY_SCRIPT_STATUS)
          .then((status) => JSON_VALUE.parse(JSON.parse(JSON.stringify(status)))),
      };
    if (result.data === '') throw new Error('The script source pagination made no progress.');
  }
  throw new Error('The script source pagination exceeded its bounded limit.');
}
async function writeChunks(
  rpc: ShellyRpc,
  method: string,
  transfer: {
    readonly base: Readonly<Record<string, JsonValue>>;
    readonly field: string;
    readonly content: string | null;
    readonly append: boolean;
  },
): Promise<JsonValue> {
  const { base, field, content, append } = transfer;
  if (content === null || content === '')
    return rpc.call(method, { ...base, [field]: content, append: false }, JSON_VALUE);
  if (Buffer.byteLength(content) > SCRIPT_BYTES) throw new ShellyChunkLimitError(field);
  let result: JsonValue = null;
  let index = 0;
  for (const chunk of utf8Chunks(content)) {
    result = await rpc.call(
      method,
      { ...base, [field]: chunk, append: append || index > 0 },
      JSON_VALUE,
    );
    index += 1;
  }
  return result;
}

function utf8Chunks(content: string): readonly string[] {
  const chunks: string[] = [];
  let chunk = '';
  let length = 0;
  for (const character of content) {
    const bytes = Buffer.byteLength(character);
    if (length + bytes > SCRIPT_CHUNK) {
      chunks.push(chunk);
      chunk = '';
      length = 0;
    }
    chunk += character;
    length += bytes;
  }
  if (chunk !== '') chunks.push(chunk);
  return chunks;
}
class ShellyChunkLimitError extends Error {
  override readonly name = 'ShellyChunkLimitError';
  constructor(readonly field: string) {
    super(`The ${field} content exceeds the supported 65536-byte transfer limit.`);
  }
}
