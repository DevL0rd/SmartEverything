import { open } from 'node:fs/promises';
import type { JsonValue } from '@smarteverything/domain';
export async function readTaskOutput(file: string, id: string): Promise<JsonValue> {
  const handle = await open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    const bytes = Buffer.alloc(Math.min(size, 200_000));
    await handle.read(bytes, 0, bytes.length, Math.max(0, size - bytes.length));
    return { task_id: id, text: bytes.toString('utf8'), truncated: size > bytes.length };
  } finally {
    await handle.close();
  }
}
