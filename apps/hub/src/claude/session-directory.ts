import {
  CLAUDE_THREAD_LIMIT,
  type ClaudeCapabilities,
  type ClaudeNotice,
  type ClaudePrompt,
  type ClaudeSession,
  type ClaudeThreadItem,
  type ClaudeThreadPage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { capabilitiesOf } from './capabilities';
import type { ClaudeControlPlane } from './control-plane';
import { INDEX_FILE, INDEX_FILE_NAME, type IndexFile } from './desktop-index';
import type { Diagnostics } from './diagnostics';
import { ClaudeSessionNotFoundError } from './errors';
import { JsonSnapshots } from './json-snapshots';
import { join } from 'node:path';
import { platform } from 'node:process';
import { JsonFiles } from './json-files';
import { LIVE_FILE, LIVE_FILE_NAME, type LiveFile } from './live-files';
import type { ClaudeLocations } from './locations';
import { pidNamespace, processStart } from './proc';
import {
  isRunning,
  liveSessionId,
  mergeSources,
  sessionOf,
  type LiveSource,
  type SessionSources,
} from './session-row';
import { readThreadPage } from './transcript-page';
import { resolveTranscript, transcriptCandidates } from './transcript-path';
import { TranscriptTails } from './transcripts';

export interface DirectoryOptions {
  readonly locations: ClaudeLocations;
  readonly historyDirectory: string;
  readonly plane: ClaudeControlPlane;
  readonly diagnostics: Diagnostics;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly publish: (notice: ClaudeNotice) => void;
  readonly settleMs: number;
  readonly log: Logger;
}

export interface DirectorySummary {
  readonly live: number;
  readonly total: number;
  readonly cliVersion: string | null;
}

interface SessionView {
  readonly source: SessionSources;
  readonly row: ClaudeSession;
}

function waitingBySession(prompts: readonly ClaudePrompt[]): ReadonlyMap<string, number> {
  const waiting = new Map<string, number>();
  for (const prompt of prompts.filter((candidate) => candidate.state === 'waiting')) {
    waiting.set(prompt.session_id, (waiting.get(prompt.session_id) ?? 0) + 1);
  }
  return waiting;
}

export class SessionDirectory {
  private readonly live: JsonFiles<LiveFile>;
  private readonly liveHistory: JsonSnapshots<LiveFile>;
  private readonly index: JsonSnapshots<IndexFile>;
  private readonly tails: TranscriptTails;
  private readonly contexts = new Map<string, number>();
  private readonly published = new Map<string, string>();
  private readonly following = new Set<string>();
  private readonly namespace = platform === 'linux' ? pidNamespace() : null;
  private quiet = true;

  constructor(private readonly options: DirectoryOptions) {
    const shared = {
      settleMs: options.settleMs,
      sleep: options.sleep,
      diagnostics: options.diagnostics,
      log: options.log,
      changed: this.reevaluate.bind(this),
    };
    this.live = new JsonFiles({
      ...shared,
      recursive: false,
      source: 'live_session',
      directory: options.locations.sessions,
      accepts: (name): boolean => LIVE_FILE_NAME.test(name),
      schema: LIVE_FILE,
      accepted: (name, file): Promise<void> => this.retainLive(name, file),
    });
    this.liveHistory = new JsonSnapshots({
      source: 'live_session',
      directory: options.locations.sessions,
      recursive: false,
      accepts: (name): boolean => LIVE_FILE_NAME.test(name),
      schema: LIVE_FILE,
      diagnostics: options.diagnostics,
      snapshot: join(options.historyDirectory, 'legacy-live.json'),
      identity: (_name, file): string => liveSessionId(file),
      acceptsValue: (name, file): boolean => this.currentNamespace(name, file),
    });
    this.index = new JsonSnapshots({
      diagnostics: options.diagnostics,
      snapshot: join(options.historyDirectory, 'legacy-index.json'),
      recursive: true,
      source: 'desktop_index',
      directory: options.locations.desktopIndex,
      accepts: (name): boolean => INDEX_FILE_NAME.test(name),
      schema: INDEX_FILE,
    });
    this.tails = new TranscriptTails({
      settleMs: options.settleMs,
      log: options.log,
      events: {
        appended: (sessionId, items): void => {
          this.threadAppended(sessionId, items);
        },
        context: (sessionId, tokens): void => {
          this.contextChanged(sessionId, tokens);
        },
      },
    });
  }

  async start(): Promise<void> {
    await Promise.all([this.live.start(), this.refreshHistory()]);
    this.refresh();
    this.quiet = false;
  }

  stop(): void {
    this.live.stop();
    this.tails.stop();
  }

  sessions(): readonly ClaudeSession[] {
    return this.refresh().map((view) => view.row);
  }

  session(id: string): ClaudeSession {
    return this.viewOf(id).row;
  }

  reevaluate(): void {
    this.refresh();
  }

  refreshHistory(): Promise<void> {
    return Promise.all([this.index.refresh(), this.liveHistory.refresh()]).then(
      (): void => undefined,
    );
  }

  summary(): DirectorySummary {
    const views = this.refresh();
    const running = views
      .filter((view) => isRunning(view.source))
      .flatMap((view) => (view.source.live === null ? [] : [view.source.live.file]));
    const newest = running.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    return { live: running.length, total: views.length, cliVersion: newest?.version ?? null };
  }

  async thread(id: string, before: number | null, limit: number): Promise<ClaudeThreadPage> {
    const { source } = this.viewOf(id);
    const path = await resolveTranscript(this.candidatesOf(source));
    return path === null
      ? { items: [], older: null, skipped: 0 }
      : readThreadPage(path, before, limit);
  }

  private viewOf(id: string): SessionView {
    const view = this.refresh().find((candidate) => candidate.row.id === id);
    if (view === undefined) {
      throw new ClaudeSessionNotFoundError(id);
    }
    return view;
  }

  private candidatesOf(source: SessionSources): string[] {
    return transcriptCandidates(
      this.options.locations.projects,
      [source.live?.file.cwd, source.index?.originCwd, source.index?.cwd],
      source.id,
    );
  }

  private aliveOf(file: LiveFile): boolean | null {
    return platform !== 'linux' || file.procStart === undefined
      ? null
      : processStart(file.pid) === file.procStart;
  }

  private retainLive(name: string, file: LiveFile): Promise<void> {
    return this.currentNamespace(name, file)
      ? this.liveHistory.retain(name, file)
      : Promise.resolve();
  }

  private currentNamespace(name: string, file: LiveFile): boolean {
    if (
      this.namespace === null ||
      file.pidDomain === undefined ||
      file.pidDomain.endsWith(this.namespace)
    )
      return true;
    this.options.diagnostics.report('live_session', name, 'belongs to another pid namespace');
    return false;
  }

  private liveSources(): LiveSource[] {
    const retained = [...this.liveHistory.all().values()].map((entry) => ({
      file: entry.value,
      present: false,
      alive: false,
    }));
    const current: LiveSource[] = [];
    for (const [name, entry] of this.live.all()) {
      if (!this.currentNamespace(name, entry.value)) continue;
      current.push({
        file: entry.value,
        present: entry.present,
        alive: entry.present ? this.aliveOf(entry.value) : false,
      });
    }
    return [...retained, ...current].filter(
      (source) => source.file.kind === undefined || source.file.kind === 'interactive',
    );
  }

  private refresh(): readonly SessionView[] {
    const { plane } = this.options;
    const indexed = [...this.index.all().values()].filter((entry) => entry.present);
    const sources = mergeSources(
      this.liveSources(),
      indexed.map((entry) => entry.value),
    );
    const waiting = waitingBySession(plane.prompts());
    const views = sources.map((source) => ({
      source,
      row: sessionOf(source, {
        context: this.contexts.get(source.id) ?? null,
        waiting: waiting.get(source.id) ?? 0,
        capabilities: (running) => this.capabilitiesFor(source, running),
      }),
    }));
    this.syncTails(views);
    this.announce(views);
    return views;
  }

  private capabilitiesFor(source: SessionSources, running: boolean): ClaudeCapabilities {
    const { plane } = this.options;
    return capabilitiesOf({ running, ...plane.sessionLink(source.id) });
  }

  private syncTails(views: readonly SessionView[]): void {
    const wanted = new Set(
      views.filter((view) => isRunning(view.source)).map((view) => view.row.id),
    );
    const followed = this.tails.followed();
    for (const id of followed) {
      if (!wanted.has(id)) {
        this.tails.unfollow(id);
        this.contexts.delete(id);
      }
    }
    for (const view of views) {
      const { id } = view.row;
      if (wanted.has(id) && !followed.has(id) && !this.following.has(id)) {
        this.follow(view.source).catch((cause: unknown) => {
          this.options.log.error('transcript.follow_failed', cause, { session: id });
        });
      }
    }
  }

  private async follow(source: SessionSources): Promise<void> {
    this.following.add(source.id);
    try {
      const path = await resolveTranscript(this.candidatesOf(source));
      if (path !== null) {
        await this.tails.follow(source.id, path);
      }
    } finally {
      this.following.delete(source.id);
    }
  }

  private announce(views: readonly SessionView[]): void {
    const known = new Set(views.map((view) => view.row.id));
    for (const { row } of views) {
      const text = JSON.stringify(row);
      if (this.published.get(row.id) !== text) {
        this.published.set(row.id, text);
        this.notify({ type: 'claude_session', session: row }, 'session.changed', {
          session: row.id,
          state: row.state,
        });
      }
    }
    for (const id of [...this.published.keys()].filter((candidate) => !known.has(candidate))) {
      this.published.delete(id);
      this.notify({ type: 'claude_session_gone', id }, 'session.removed', { session: id });
    }
  }

  private notify(notice: ClaudeNotice, event: string, payload: Record<string, unknown>): void {
    if (this.quiet) {
      return;
    }
    this.options.log.info(event, payload);
    this.options.publish(notice);
  }

  private threadAppended(sessionId: string, items: readonly ClaudeThreadItem[]): void {
    for (let from = 0; from < items.length; from += CLAUDE_THREAD_LIMIT) {
      this.notify(
        {
          type: 'claude_thread',
          session_id: sessionId,
          items: items.slice(from, from + CLAUDE_THREAD_LIMIT),
        },
        'thread.appended',
        { session: sessionId, count: Math.min(CLAUDE_THREAD_LIMIT, items.length - from) },
      );
    }
  }

  private contextChanged(sessionId: string, tokens: number | null): void {
    if (tokens === null) {
      this.contexts.delete(sessionId);
    } else {
      this.contexts.set(sessionId, tokens);
    }
    this.refresh();
  }
}
