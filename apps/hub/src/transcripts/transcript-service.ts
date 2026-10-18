import type { PluginSpeechReader } from '../store/repositories/speech';
import type { TranscriptFeedQuery, TranscriptScope } from '../store/repositories/transcript-reader';
import {
  ApiError,
  TRANSCRIPT_SOURCES,
  type TranscriptPage,
  type TranscriptRange,
  type TranscriptDetail,
  type TranscriptHit,
  type TranscriptLine,
  type TranscriptLineInput,
  type TranscriptSession,
  type TranscriptSettings,
  type TranscriptSettingsChange,
  type TranscriptSource,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { LineLevels } from './line-levels';
import { collapseHeard } from './merged-read';
import { TranscriptSettingsStore } from './transcript-settings';

export interface TranscriptsOptions {
  readonly store: Pick<Store, 'transcripts' | 'settingsKv' | 'speech'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export interface TranscriptOpening {
  readonly source: TranscriptSource;
  readonly sourceId: string;
  readonly pluginId: string | null;
  readonly title: string;
  readonly retentionDays: number | null;
  readonly startedAt?: string;
}

export interface TranscriptFilter {
  readonly source?: TranscriptSource | undefined;
  readonly sourceId?: string | undefined;
  readonly pluginId?: string | undefined;
}

export class Transcripts {
  private readonly saved: TranscriptSettingsStore;
  private readonly levels = new LineLevels();
  private timer: Cancel | null = null;

  constructor(private readonly options: TranscriptsOptions) {
    this.saved = new TranscriptSettingsStore(options.store);
  }

  start(): void {
    const { transcripts } = this.options.store;
    const at = this.now().toISOString();
    const closed = TRANSCRIPT_SOURCES.reduce(
      (total, source) => total + transcripts.closeOpen(source, at),
      0,
    );
    if (closed > 0) {
      this.options.log.info('transcripts.unfinished_closed', { count: closed });
    }
    this.prune();
  }

  stop(): void {
    this.timer?.();
    this.timer = null;
  }

  settings(): TranscriptSettings {
    return this.saved.read();
  }

  updateSettings(change: TranscriptSettingsChange): TranscriptSettings {
    const settings = this.saved.save(change);
    this.options.log.info('transcripts.settings_changed', { ...settings });
    this.prune();
    return settings;
  }

  open(opening: TranscriptOpening): TranscriptSession {
    const session = this.options.store.transcripts.open({
      ...opening,
      startedAt: opening.startedAt ?? this.now().toISOString(),
    });
    this.arm();
    return session;
  }

  speechReader(pluginId: string, reader: PluginSpeechReader): () => void {
    return this.options.store.speech.register(pluginId, reader);
  }

  add(sessionId: string, line: TranscriptLineInput, levelDbfs?: number): TranscriptLine {
    const added = this.options.store.transcripts.append(sessionId, line);
    if (levelDbfs !== undefined) {
      this.levels.note(added.id, levelDbfs, this.now().getTime());
    }
    return added;
  }

  close(sessionId: string, endedAt?: string): TranscriptSession {
    return this.options.store.transcripts.close(sessionId, endedAt ?? this.now().toISOString());
  }

  find(sessionId: string): TranscriptSession | undefined {
    return this.options.store.transcripts.find(sessionId);
  }

  recent(sessionId: string, sinceMs: number, limit: number): TranscriptLine[] {
    const since = new Date(this.now().getTime() - sinceMs).toISOString();
    return this.options.store.transcripts.recent(sessionId, since, limit);
  }

  list(
    filter: TranscriptFilter & { readonly before?: string | undefined; readonly limit: number },
  ): TranscriptSession[] {
    return this.options.store.transcripts.list(filter);
  }

  read(sessionId: string, after: number, limit: number): TranscriptDetail {
    const { transcripts } = this.options.store;
    const session = transcripts.byId(sessionId);
    const lines = transcripts.lines(sessionId, after, limit + 1);
    return { session, lines: lines.slice(0, limit), more: lines.length > limit };
  }

  search(
    filter: TranscriptFilter & { readonly words: string; readonly limit: number },
  ): TranscriptHit[] {
    const hits = this.options.store.transcripts.search(filter);
    const kept = new Set(
      collapseHeard(
        hits.map((hit) => ({
          line: hit.line,
          origin: `${hit.session.source}:${hit.session.source_id}`,
          levelDbfs: this.levels.of(hit.line.id),
        })),
      ).map((heard) => heard.line.id),
    );
    return hits.filter((hit) => kept.has(hit.line.id));
  }

  feed(scope: TranscriptScope, query: TranscriptFeedQuery): TranscriptPage {
    return this.options.store.transcripts.reader.feed(scope, query);
  }

  range(scope: TranscriptScope, anchor: number, limit: number): TranscriptRange {
    return this.options.store.transcripts.reader.range(scope, anchor, limit);
  }

  remove(sessionId: string): void {
    const session = this.options.store.transcripts.byId(sessionId);
    if (session.source === 'plugin' && session.ended_at === null) {
      throw new ApiError(
        'conflict',
        'That conversation is still going; delete its transcript when it has ended.',
      );
    }
    this.options.store.transcripts.remove(sessionId);
    this.arm();
  }

  removeLine(sessionId: string, lineId: number): void {
    this.options.store.transcripts.removeLine(sessionId, lineId);
  }

  private prune(): void {
    const removed = this.options.store.transcripts.prune(
      this.now().toISOString(),
      this.saved.read().retention_days,
    );
    if (removed > 0) {
      this.options.log.info('transcripts.expired_removed', { count: removed });
    }
    this.arm();
  }

  private arm(): void {
    this.timer?.();
    this.timer = null;
    const next = this.options.store.transcripts.nextExpiry(this.saved.read().retention_days);
    if (next === null) {
      return;
    }
    this.timer = this.options.clock.at(new Date(next), () => {
      this.timer = null;
      this.prune();
    });
  }

  private now(): Date {
    return this.options.clock.now();
  }
}
