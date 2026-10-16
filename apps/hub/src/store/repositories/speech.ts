import { z } from 'zod';
import { ApiError, type TranscriptSession, type SpeechSource } from '@smarteverything/domain';
import type { ToolCaller } from '../../ai-tools/hub-tool';
import { SPEECH_PRINCIPAL, type SpeechPrincipal } from '../../transcripts/speech-principal';
import type { SpeechOccurrence } from '../../transcripts/speech';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const SEQUENCE = z.strictObject({ next_id: z.int().positive() });
const GRANT = z.strictObject({
  revision: z.string(),
  principal: SQL_JSON.pipe(SPEECH_PRINCIPAL),
  watermark: z.int().nonnegative(),
});
export type SpeechGrant = z.infer<typeof GRANT>;
export interface PluginSpeechReader {
  readonly readTool: (session?: TranscriptSession) => {
    readonly name: string;
    readonly args: Readonly<Record<string, unknown>>;
  };
  readonly admit: (caller: ToolCaller, sourceId?: string) => void;
  readonly sources: (
    caller: ToolCaller,
  ) => readonly { readonly source: SpeechSource; readonly label: string }[];
  readonly validate: (caller: ToolCaller, session?: TranscriptSession, sourceId?: string) => void;
}
export class DuplicateSpeechOccurrenceError extends Error {
  override readonly name = 'DuplicateSpeechOccurrenceError';
  constructor() {
    super('This committed speech occurrence was already admitted.');
  }
}

export class SpeechRepository {
  private readonly readers = new Map<string, PluginSpeechReader>();
  constructor(private readonly context: StoreContext) {}

  watermark(): number {
    const row = this.context.sql.get(
      SEQUENCE,
      'select next_id from speech_sequence where singleton=1',
    );
    if (row === undefined)
      throw new ApiError('conflict', 'The speech commit sequence is unavailable.');
    return row.next_id - 1;
  }
  nextCommit(): number {
    const id = this.watermark() + 1;
    this.context.sql.run(
      'advance speech commit identity',
      'update speech_sequence set next_id=next_id+1 where singleton=1',
    );
    return id;
  }
  grant(id: string): SpeechGrant | undefined {
    return this.context.sql.get(
      GRANT,
      'select revision,principal,watermark from automation_speech_grants where automation_id=$id',
      { id },
    );
  }
  save(id: string, revision: string, principal: SpeechPrincipal): void {
    this.context.sql.run(
      'bind the speech trigger reader',
      `insert into automation_speech_grants(automation_id,revision,principal,watermark) values($id,$revision,$principal,$watermark)
       on conflict(automation_id) do update set revision=excluded.revision,principal=excluded.principal,watermark=excluded.watermark`,
      { id, revision, principal: jsonText(principal), watermark: this.watermark() },
    );
    this.context.sql.run(
      'remove superseded speech admissions',
      'delete from automation_speech_occurrences where automation_id=$id and revision<>$revision',
      { id, revision },
    );
  }
  remove(id: string): void {
    this.context.sql.run(
      'remove the speech trigger grant',
      'delete from automation_speech_grants where automation_id=$id',
      { id },
    );
  }
  claim(occurrence: SpeechOccurrence): void {
    const changed = this.context.sql.run(
      'admit committed speech once',
      'insert or ignore into automation_speech_occurrences(automation_id,revision,commit_id) values($automationId,$revision,$commitId)',
      { ...occurrence },
    );
    if (changed === 0) throw new DuplicateSpeechOccurrenceError();
  }
  register(pluginId: string, reader: PluginSpeechReader): () => void {
    this.readers.set(pluginId, reader);
    return (): void => {
      if (this.readers.get(pluginId) === reader) this.readers.delete(pluginId);
    };
  }
  plugin(pluginId: string): PluginSpeechReader | undefined {
    return this.readers.get(pluginId);
  }
  plugins(): readonly (readonly [string, PluginSpeechReader])[] {
    return [...this.readers];
  }
}
