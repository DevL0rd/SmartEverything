import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodexProviderTurn } from '@smarteverything/domain';
import { CodexRuntimeError } from './errors';
import type { RpcRecord } from './protocol';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TURN_BYTES = 32 * 1024 * 1024 - 1024;
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
} as const;
export class CodexInputs {
  private folder: string | null = null;
  constructor(private readonly root: string) {}
  async prepare(turn: CodexProviderTurn): Promise<RpcRecord[]> {
    if (Buffer.byteLength(JSON.stringify(turn)) > MAX_TURN_BYTES)
      throw new CodexRuntimeError(
        'content',
        'The Codex provider turn exceeds its transport byte limit.',
      );
    const resumed = turn.session_id !== null;
    const messages = resumed ? turn.messages.slice(-1) : turn.messages;
    if (messages.at(-1)?.role !== 'user')
      throw new CodexRuntimeError('content', 'Codex turn input must end with a user message.');
    const input: RpcRecord[] = [];
    for (const message of messages)
      for (const content of message.content) {
        if (content.type === 'text')
          input.push({
            type: 'text',
            text: resumed ? content.text : `${message.role}: ${content.text}`,
            text_elements: [],
          });
        else if (content.type === 'image') input.push(await this.image(content));
        else
          throw new CodexRuntimeError(
            'content',
            'This Codex adapter does not convert PDF or other unsupported inputs.',
          );
      }
    return input;
  }
  async remove(): Promise<void> {
    if (this.folder !== null) await rm(this.folder, { recursive: true, force: true });
    this.folder = null;
  }
  private async image(
    content: Extract<CodexProviderTurn['messages'][number]['content'][number], { type: 'image' }>,
  ): Promise<RpcRecord> {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content.data))
      throw new CodexRuntimeError('content', 'The Codex image must contain valid base64 bytes.');
    const bytes = Buffer.from(content.data, 'base64');
    if (bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== content.data)
      throw new CodexRuntimeError(
        'content',
        'The Codex image is oversized or is not canonical base64.',
      );
    if (this.folder === null) {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      this.folder = await mkdtemp(join(this.root, 'input-'));
    }
    const path = join(this.folder, `${inputName()}.${EXTENSIONS[content.media_type]}`);
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    return { type: 'localImage', path };
  }
}
function inputName(): string {
  return randomUUID();
}
