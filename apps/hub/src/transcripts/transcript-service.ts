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
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { Store } from '../store/store';
import { LineLevels } from './line-levels';
import { collapseHeard } from './merged-read';
import { TranscriptSettingsStore } from './transcript-settings';

export interface TranscriptsOptions {
  readonly store: Pick<Store, 'host' | 'live'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

export interface TranscriptOpening {
  readonly id?: string;
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

export type LineRemoved = (lineId: number | null) => void;

export class Transcripts {
  private readonly saved: TranscriptSettingsStore;
  private readonly levels = new LineLevels();
  private readonly removals = new Map<string, Set<LineRemoved>>();
  private timer: Cancel | null = null;
  private arming: Promise<void> = Promise.resolve();

  constructor(private readonly options: TranscriptsOptions) {
    this.saved = new TranscriptSettingsStore(options.store.host);
  }

  async start(): Promise<void> {
    const { host } = this.options.store;
    const at = this.now().toISOString();
    const closed = await Promise.all(
      TRANSCRIPT_SOURCES.map((source) => host.call('transcripts', 'closeOpen', source, at)),
    );
    const count = closed.reduce((total, each) => total + each, 0);
    if (count > 0) {
      this.options.log.info('transcripts.unfinished_closed', { count });
    }
    await this.prune();
  }

  stop(): void {
    this.timer?.();
    this.timer = null;
  }

  settings(): Promise<TranscriptSettings> {
    return this.saved.read();
  }

  async updateSettings(change: TranscriptSettingsChange): Promise<TranscriptSettings> {
    const settings = await this.saved.save(change);
    this.options.log.info('transcripts.settings_changed', { ...settings });
    await this.prune();
    return settings;
  }

  async open(opening: TranscriptOpening): Promise<TranscriptSession> {
    const session = await this.options.store.host.call('transcripts', 'open', {
      ...opening,
      startedAt: opening.startedAt ?? this.now().toISOString(),
    });
    this.rearm();
    return session;
  }

  speechReader(pluginId: string, reader: PluginSpeechReader): () => void {
    return this.options.store.live.speechReaders.register(pluginId, reader);
  }

  async add(
    sessionId: string,
    line: TranscriptLineInput,
    levelDbfs?: number,
  ): Promise<TranscriptLine> {
    const added = await this.options.store.host.call('transcripts', 'append', sessionId, line);
    if (levelDbfs !== undefined) {
      this.levels.note(added.id, levelDbfs, this.now().getTime());
    }
    return added;
  }

  close(sessionId: string, endedAt?: string): Promise<TranscriptSession> {
    return this.options.store.host.call(
      'transcripts',
      'close',
      sessionId,
      endedAt ?? this.now().toISOString(),
    );
  }

  find(sessionId: string): Promise<TranscriptSession | undefined> {
    return this.options.store.host.call('transcripts', 'find', sessionId);
  }

  recent(sessionId: string, sinceMs: number, limit: number): Promise<TranscriptLine[]> {
    const since = new Date(this.now().getTime() - sinceMs).toISOString();
    return this.options.store.host.call('transcripts', 'recent', sessionId, since, limit);
  }

  list(
    filter: TranscriptFilter & { readonly before?: string | undefined; readonly limit: number },
  ): Promise<TranscriptSession[]> {
    return this.options.store.host.call('transcripts', 'list', filter);
  }

  read(sessionId: string, after: number, limit: number): Promise<TranscriptDetail> {
    return this.options.store.host.read('transcriptDetail', { sessionId, after, limit });
  }

  async search(
    filter: TranscriptFilter & { readonly words: string; readonly limit: number },
  ): Promise<TranscriptHit[]> {
    const hits = await this.options.store.host.call('transcripts', 'search', filter);
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

  feed(scope: TranscriptScope, query: TranscriptFeedQuery): Promise<TranscriptPage> {
    return this.options.store.host.read('transcriptFeed', { scope, query });
  }

  range(scope: TranscriptScope, anchor: number, limit: number): Promise<TranscriptRange> {
    return this.options.store.host.read('transcriptRange', { scope, anchor, limit });
  }

  async remove(sessionId: string): Promise<void> {
    const session = await this.options.store.host.call('transcripts', 'byId', sessionId);
    if (session.source === 'plugin' && session.ended_at === null) {
      throw new ApiError(
        'conflict',
        'That conversation is still going; delete its transcript when it has ended.',
      );
    }
    await this.options.store.host.call('transcripts', 'remove', sessionId);
    this.removed(sessionId, null);
    this.rearm();
  }

  async removeLine(sessionId: string, lineId: number): Promise<void> {
    await this.options.store.host.call('transcripts', 'removeLine', sessionId, lineId);
    this.removed(sessionId, lineId);
  }

  onRemoved(sessionId: string, listener: LineRemoved): () => void {
    const listeners = this.removals.get(sessionId) ?? new Set<LineRemoved>();
    listeners.add(listener);
    this.removals.set(sessionId, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0) this.removals.delete(sessionId);
    };
  }

  private removed(sessionId: string, lineId: number | null): void {
    for (const listener of this.removals.get(sessionId) ?? []) listener(lineId);
  }

  private async prune(): Promise<void> {
    const { retention_days: days } = await this.saved.read();
    const removed = await this.options.store.host.call(
      'transcripts',
      'prune',
      this.now().toISOString(),
      days,
    );
    if (removed > 0) {
      this.options.log.info('transcripts.expired_removed', { count: removed });
    }
    await this.arm();
  }

  private rearm(): void {
    const armed = this.arming.then(() => this.arm());
    this.arming = armed.then(
      () => undefined,
      () => undefined,
    );
    background(armed, 'transcripts.expiry_arm_failed');
  }

  private async arm(): Promise<void> {
    const { retention_days: days } = await this.saved.read();
    const next = await this.options.store.host.call('transcripts', 'nextExpiry', days);
    this.timer?.();
    this.timer = null;
    if (next === null) {
      return;
    }
    this.timer = this.options.clock.at(new Date(next), () => {
      this.timer = null;
      background(this.prune(), 'transcripts.prune_failed');
    });
  }

  private now(): Date {
    return this.options.clock.now();
  }
}
