import type { PluginSpeechReader } from '../store/repositories/speech';
import type {
  PluginTranscriptPage,
  PluginTranscriptPageQuery,
} from '../store/repositories/plugin-transcript-page';
import type { TranscriptFeedQuery, TranscriptScope } from '../store/repositories/transcript-reader';
import {
  ApiError,
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
import { TranscriptSettingsStore } from './transcript-settings';

export interface TranscriptsOptions {
  readonly store: Pick<Store, 'transcripts' | 'aiChats' | 'speech'>;
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
  private timer: Cancel | null = null;

  constructor(private readonly options: TranscriptsOptions) {
    this.saved = new TranscriptSettingsStore(options.store);
  }

  start(): void {
    const { transcripts } = this.options.store;
    const at = this.now().toISOString();
    const closed = transcripts.closeOpen('camera', at) + transcripts.closeOpen('plugin', at);
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

  add(sessionId: string, line: TranscriptLineInput): TranscriptLine {
    return this.options.store.transcripts.append(sessionId, line);
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
    return this.options.store.transcripts.search(filter);
  }

  feed(scope: TranscriptScope, query: TranscriptFeedQuery): TranscriptPage {
    return this.options.store.transcripts.reader.feed(scope, query);
  }

  range(scope: TranscriptScope, anchor: number, limit: number): TranscriptRange {
    return this.options.store.transcripts.reader.range(scope, anchor, limit);
  }

  pluginPage(
    pluginId: string,
    sessionId: string,
    query: PluginTranscriptPageQuery,
  ): PluginTranscriptPage {
    return this.options.store.transcripts.pluginPage.read(pluginId, sessionId, query);
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
