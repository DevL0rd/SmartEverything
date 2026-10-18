import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type CodexProviderTurn } from '@smarteverything/domain';
import { CodexRuntimeError } from './errors';
import { isMissing } from '../fs-util';
const RECORD = z.strictObject({
  session_id: z.string().min(1).max(200),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  cwd: z.string().min(1).max(4096),
  tool_signature: z.string().min(1),
  workspace_roots: z.array(z.string()).max(101),
});
const RECORDS = z.array(RECORD).max(10_000);
export type CodexSessionBinding = z.infer<typeof RECORD>;
export class CodexSessions {
  private records: CodexSessionBinding[] = [];
  private readonly loaded: Promise<void>;
  private writing: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {
    this.loaded = this.load();
    void this.loaded.catch((cause: unknown): void => {
      this.writing = Promise.reject(
        cause instanceof Error
          ? cause
          : new CodexRuntimeError('session', 'Codex binding load failed.'),
      );
      // eslint-disable-next-line local/no-swallowed-errors -- the failure is rethrown to every caller that awaits the write
      void this.writing.catch((): void => undefined);
    });
  }
  async check(
    sessionId: string | null,
    chatId: string,
    profileId: string,
    cwd: string,
  ): Promise<void> {
    await this.loaded;
    await this.writing;
    if (sessionId === null) return;
    if (
      !this.records.some(
        (entry) =>
          entry.session_id === sessionId &&
          entry.chat_id === chatId &&
          entry.profile_id === profileId &&
          entry.cwd === cwd,
      )
    )
      throw new CodexRuntimeError(
        'session',
        'Resume must name a Codex provider session owned by this chat, profile, computer and execution folder.',
      );
  }
  async checkTurn(turn: CodexProviderTurn, cwd: string, roots: readonly string[]): Promise<void> {
    await this.check(turn.session_id, turn.chat_id, turn.profile_id, cwd);
    if (turn.session_id === null) return;
    const record = this.records.find((entry) => entry.session_id === turn.session_id);
    if (
      record?.tool_signature !== toolSignature(turn) ||
      JSON.stringify(record.workspace_roots) !== JSON.stringify([cwd, ...roots])
    )
      throw new CodexRuntimeError(
        'session',
        'The saved Codex session has different frozen tool grants or workspace roots; open a new provider session.',
      );
  }
  list(chatId: string, profileId: string): readonly CodexSessionBinding[] {
    return this.records.filter(
      (entry) => entry.chat_id === chatId && entry.profile_id === profileId,
    );
  }
  remember(record: CodexSessionBinding): Promise<void> {
    return this.mutate((): void => {
      const known = this.records.find((entry) => entry.session_id === record.session_id);
      if (known !== undefined) {
        if (JSON.stringify(known) !== JSON.stringify(record))
          throw new CodexRuntimeError(
            'session',
            'Codex returned a session already bound to different input.',
          );
        return;
      }
      if (this.records.length >= 10_000)
        throw new CodexRuntimeError('session', 'Codex provider session capacity reached.');
      this.records.push(RECORD.parse(record));
    });
  }
  forget(sessionId: string): Promise<void> {
    return this.mutate((): void => {
      this.records = this.records.filter((entry) => entry.session_id !== sessionId);
    });
  }
  private mutate(change: () => void): Promise<void> {
    this.writing = this.writing.then(async (): Promise<void> => {
      await this.loaded;
      change();
      await this.save();
    });
    return this.writing;
  }
  private async save(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, 'provider-bindings.json');
    await writeFile(`${path}.tmp`, `${JSON.stringify(this.records)}\n`, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  }
  private async load(): Promise<void> {
    try {
      const handle = await open(join(this.directory, 'provider-bindings.json'), 'r');
      try {
        const info = await handle.stat();
        if (info.size > 8 * 1024 * 1024)
          throw new CodexRuntimeError(
            'session',
            'Codex provider bindings exceed their byte limit.',
          );
        this.records = RECORDS.parse(JSON.parse(await handle.readFile('utf8')));
      } finally {
        await handle.close();
      }
    } catch (cause) {
      if (!isMissing(cause))
        throw new CodexRuntimeError(
          'session',
          'The local Codex provider binding file is invalid or unreadable.',
        );
    }
  }
}
export function toolSignature(turn: CodexProviderTurn): string {
  return createHash('sha256').update(canonicalRuntimeInput(turn.tools)).digest('hex');
}
