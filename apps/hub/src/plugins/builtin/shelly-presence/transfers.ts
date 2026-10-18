import { ApiError, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import {
  SHELLY_CERTIFICATE_METHODS,
  SHELLY_CERTIFICATE_TARGETS,
  type ShellyAction,
} from '@smarteverything/shelly';
import { shellyPasswordHash } from '@smarteverything/shelly/rpc';
import { z } from 'zod';
import type { OperationHandler, OperationPorts } from './ports';

const TEXT_CHUNK_BYTES = 1024;
const FIRMWARE_CHUNK_BYTES = 2048;
const CODE_CHUNK = z.object({ data: z.string(), left: z.int().nonnegative() });
const SCRIPT_ID = z.object({ id: z.int() });
const PUT_CODE = SCRIPT_ID.extend({ code: z.string(), append: z.boolean().optional() });
const CERTIFICATE = z.object({
  target: z.enum(SHELLY_CERTIFICATE_TARGETS),
  data: z.string().nullable(),
  append: z.boolean().optional(),
});
const PASSWORD = z.object({ password: z.string().nullable() });
const FIRMWARE_WRITE = z.object({ offset: z.int().nonnegative(), data: z.base64() });
const FIRMWARE_START = z.object({ size: z.int().positive() });
const OFFSET = z.object({ offset: z.int().nonnegative() });

function textChunks(content: string): readonly string[] {
  const chunks: string[] = [];
  let chunk = '';
  let length = 0;
  for (const character of content) {
    const bytes = Buffer.byteLength(character);
    if (length + bytes > TEXT_CHUNK_BYTES) {
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

async function putText(
  ports: OperationPorts,
  method: string,
  transfer: { readonly base: Record<string, JsonValue>; readonly field: string },
  content: { readonly text: string | null; readonly append: boolean },
): Promise<JsonValue> {
  const { base, field } = transfer;
  if (content.text === null || content.text === '')
    return ports.call(method, { ...base, [field]: content.text, append: false }, JSON_VALUE);
  let result: JsonValue = null;
  for (const [index, chunk] of textChunks(content.text).entries())
    result = await ports.call(
      method,
      { ...base, [field]: chunk, append: content.append || index > 0 },
      JSON_VALUE,
    );
  return result;
}

const scriptCode: OperationHandler = async (ports, params) => {
  const { id } = SCRIPT_ID.parse(params);
  let code = '';
  let offset = 0;
  for (;;) {
    const page = await ports.call(
      'Script.GetCode',
      { id, offset, len: TEXT_CHUNK_BYTES },
      CODE_CHUNK,
    );
    code += page.data;
    offset += Buffer.byteLength(page.data);
    if (page.left === 0) break;
    if (page.data === '') throw new ApiError('upstream_failed', 'The script source stopped early.');
  }
  return { code, status: await ports.call('Script.GetStatus', { id }, JSON_VALUE) };
};

const scriptPutCode: OperationHandler = (ports, params) => {
  const { id, code, append } = PUT_CODE.parse(params);
  return putText(
    ports,
    'Script.PutCode',
    { base: { id }, field: 'code' },
    { text: code, append: append ?? false },
  );
};

const certificatePut: OperationHandler = (ports, params) => {
  const { target, data, append } = CERTIFICATE.parse(params);
  return putText(
    ports,
    SHELLY_CERTIFICATE_METHODS[target],
    { base: {}, field: 'data' },
    { text: data, append: append ?? false },
  );
};

const devicePassword: OperationHandler = (ports, params) => {
  const { password } = PASSWORD.parse(params);
  const { id } = ports.device();
  return ports.call(
    'Shelly.SetAuth',
    { user: 'admin', realm: id, ha1: password === null ? null : shellyPasswordHash(id, password) },
    JSON_VALUE,
  );
};

const firmwareStart: OperationHandler = (ports, params) =>
  ports.call('OTA.Start', FIRMWARE_START.parse(params), JSON_VALUE);

const firmwareAbort: OperationHandler = (ports) => ports.call('OTA.Abort', {}, JSON_VALUE);

const firmwareWrite: OperationHandler = async (ports, params) => {
  const { offset, data } = FIRMWARE_WRITE.parse(params);
  const bytes = Buffer.from(data, 'base64');
  let written = offset;
  for (let at = 0; at < bytes.length; at += FIRMWARE_CHUNK_BYTES) {
    const chunk = bytes.subarray(at, at + FIRMWARE_CHUNK_BYTES);
    const reply = await ports.call(
      'OTA.Write',
      { offset: written, data: chunk.toString('base64') },
      OFFSET,
    );
    written += chunk.length;
    if (reply.offset !== written)
      throw new ApiError(
        'upstream_failed',
        `The sensor moved the firmware offset to ${String(reply.offset)} instead of ${String(written)}.`,
      );
  }
  return { offset: written };
};

export const TRANSFER_HANDLERS = {
  script_code: scriptCode,
  script_put_code: scriptPutCode,
  certificate_put: certificatePut,
  device_password: devicePassword,
  firmware_upload_start: firmwareStart,
  firmware_upload_abort: firmwareAbort,
  firmware_upload_write: firmwareWrite,
} satisfies Partial<Record<ShellyAction, OperationHandler>>;
