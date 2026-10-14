import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { NATIVE_MANAGED_PROJECT, type ProviderTurn } from '@smarteverything/domain';
import { ProviderInputError } from './input';

const SESSION_RECORD = z.strictObject({
  session_id: z.string().min(1).max(200),
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  cwd: z.string().min(1).max(4096),
  resumable: z.boolean().default(true),
  managed_project: NATIVE_MANAGED_PROJECT.optional(),
});
const RECORDS = z.array(SESSION_RECORD);
type SessionRecord = z.infer<typeof SESSION_RECORD>;
type SessionInput = z.input<typeof SESSION_RECORD>;

export class ProviderSessions {
  private records: SessionRecord[] = [];
  private readonly loaded: Promise<void>;
  private writing = Promise.resolve();

  constructor(private readonly directory: string) {
    this.loaded = this.load();
    void this.loaded.catch((): void => undefined);
  }

  async check(
    sessionId: string | null,
    chatId: string,
    profileId: string,
    cwd: string,
  ): Promise<void> {
    await this.loaded;
    await this.writing;
    if (sessionId === null) {
      return;
    }
    if (!this.owns(sessionId, chatId, profileId, cwd)) {
      throw new ProviderInputError(
        'Resume must name a provider session bound to this chat, profile and computer working directory.',
      );
    }
  }

  async checkProject(turn: ProviderTurn): Promise<void> {
    await this.loaded;
    await this.writing;
    if (turn.session_id === null) return;
    const saved = this.records.find((entry) => entry.session_id === turn.session_id);
    if (JSON.stringify(saved?.managed_project) !== JSON.stringify(turn.managed_project))
      throw new ProviderInputError(
        'The saved native session has a different managed project binding.',
      );
  }

  async available(sessionId: string): Promise<void> {
    await this.loaded;
    await this.writing;
    if (this.records.some((record) => record.session_id === sessionId))
      throw new ProviderInputError(
        'A new provider job cannot reuse an existing owned native session ID.',
      );
  }

  async resumable(sessionId: string): Promise<void> {
    await this.loaded;
    await this.writing;
    const record = this.records.find((entry) => entry.session_id === sessionId);
    if (record?.resumable !== true)
      throw new ProviderInputError(
        'This native session was not persisted and cannot be resumed after its process closed.',
      );
  }

  owns(sessionId: string, chatId: string, profileId: string, cwd: string): boolean {
    return this.records.some(
      (entry) =>
        entry.session_id === sessionId &&
        entry.chat_id === chatId &&
        entry.profile_id === profileId &&
        entry.cwd === cwd,
    );
  }

  list(chatId: string, profileId: string): readonly SessionRecord[] {
    return this.records.filter(
      (entry) => entry.chat_id === chatId && entry.profile_id === profileId,
    );
  }

  remember(record: SessionInput): Promise<void> {
    this.writing = this.writing.then(async () => {
      await this.loaded;
      const previous = this.records.find((entry) => entry.session_id === record.session_id);
      if (previous !== undefined) {
        if (!this.owns(record.session_id, record.chat_id, record.profile_id, record.cwd))
          throw new ProviderInputError(
            'The native session is already bound to a different chat, profile or working directory.',
          );
        if (JSON.stringify(previous.managed_project) !== JSON.stringify(record.managed_project))
          throw new ProviderInputError('The native session managed project binding changed.');
        if (previous.resumable && record.resumable === false) {
          this.records = this.records.map((entry) =>
            entry.session_id === record.session_id ? { ...entry, resumable: false } : entry,
          );
          await this.save();
        }
        return;
      }
      this.records.push(SESSION_RECORD.parse(record));
      await this.save();
    });
    return this.writing;
  }

  forget(sessionId: string): Promise<void> {
    this.writing = this.writing.then(async () => {
      await this.loaded;
      this.records = this.records.filter((entry) => entry.session_id !== sessionId);
      await this.save();
    });
    return this.writing;
  }

  private async save(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await Promise.all([
      this.saveRecords(
        'provider-sessions.json',
        this.records.filter((record) => record.managed_project === undefined),
      ),
      this.saveRecords(
        'provider-managed-sessions.json',
        this.records.filter((record) => record.managed_project !== undefined),
      ),
    ]);
  }
  private async saveRecords(file: string, records: readonly SessionRecord[]): Promise<void> {
    const path = join(this.directory, file);
    await writeFile(`${path}.tmp`, `${JSON.stringify(records)}\n`, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  }
  private async load(): Promise<void> {
    const records = await Promise.all([
      this.loadRecords('provider-sessions.json'),
      this.loadRecords('provider-managed-sessions.json'),
    ]);
    this.records = records.flat();
  }
  private async loadRecords(file: string): Promise<SessionRecord[]> {
    try {
      const json: unknown = JSON.parse(await readFile(join(this.directory, file), 'utf8'));
      return RECORDS.parse(json);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
      throw new ProviderInputError(
        'The local provider session directory is invalid or unreadable.',
      );
    }
  }
}
