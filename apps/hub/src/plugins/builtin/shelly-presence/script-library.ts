import { jsonOf } from './action-plan';
import {
  ApiError,
  SHELLY_SCRIPT_LIBRARY,
  type JsonValue,
  type ShellyPresenceAction,
} from '@smarteverything/domain';
const ROOT = 'https://raw.githubusercontent.com/ALLTERCO/shelly-script-examples/main/';
export async function readScriptLibrary(
  action: ShellyPresenceAction,
  signal: AbortSignal,
): Promise<JsonValue | undefined> {
  if (action.action !== 'script_library' && action.action !== 'script_example') return undefined;
  const raw: unknown = JSON.parse(
    await readFile(new URL('examples-manifest.json', ROOT), signal, 524288),
  );
  const examples = SHELLY_SCRIPT_LIBRARY.parse(raw);
  if (action.action === 'script_library') return jsonOf({ examples });
  if (!examples.some((example) => example.fname === action.fname))
    throw new ApiError('not_found', 'The script example is not listed by the manufacturer.');
  return { fname: action.fname, code: await readFile(new URL(action.fname, ROOT), signal, 65536) };
}
async function readFile(url: URL, signal: AbortSignal, limit: number): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    redirect: 'error',
  });
  if (!response.ok)
    throw new ApiError(
      'upstream_failed',
      `The manufacturer script library returned HTTP ${String(response.status)}.`,
    );
  const reader = response.body?.getReader();
  if (reader === undefined)
    throw new ApiError('upstream_failed', 'The manufacturer file is empty.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const raw: unknown = chunk.value;
      const data = z.instanceof(Uint8Array).parse(raw);
      size += data.byteLength;
      if (size > limit)
        throw new ApiError(
          'upstream_failed',
          'The manufacturer file exceeds the supported download limit.',
        );
      chunks.push(data);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
import { z } from 'zod';
