import { open } from 'node:fs/promises';
import type { JsonValue } from '@smarteverything/domain';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
async function readTaskOutput(file: string, id: string): Promise<JsonValue> {
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

export class JobTasks {
  private snapshot: JsonValue = [];
  private readonly files = new Map<string, string>();

  list(): JsonValue {
    return this.snapshot;
  }

  async output(id: string, missing: () => Error): Promise<JsonValue> {
    const file = this.files.get(id);
    if (file === undefined) throw missing();
    return readTaskOutput(file, id);
  }

  capture(message: SDKMessage, payload: JsonValue): void {
    if (message.type === 'system' && message.subtype === 'background_tasks_changed')
      this.snapshot = payload;
    if (message.type === 'system' && message.subtype === 'task_notification')
      this.files.set(message.task_id, message.output_file);
  }
}
