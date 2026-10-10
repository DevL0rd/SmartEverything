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
import { JsonFiles } from './json-files';
import { LIVE_FILE, LIVE_FILE_NAME, type LiveFile } from './live-files';
import type { ClaudeLocations } from './locations';
import { pidNamespace, processStart } from './proc';
import {
  isRunning,
  mergeSources,
  sessionOf,
  type LiveSource,
  type SessionSources,
} from './session-row';
import { readThreadPage } from './transcript-page';
import { resolveTranscript, transcriptCandidates } from './transcript-path';
import { TranscriptTails } from './transcripts';

const RESUMABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface DirectoryOptions {
  readonly locations: ClaudeLocations;
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
  private readonly index: JsonFiles<IndexFile>;
  private readonly tails: TranscriptTails;
  private readonly contexts = new Map<string, number>();
  private readonly published = new Map<string, string>();
  private readonly following = new Set<string>();
  private readonly userMessageCounts = new Map<string, number>();
  private readonly watchers = new Set<() => void>();
  private views: readonly SessionView[] = [];
  private readonly namespace = pidNamespace();
  private quiet = true;

  constructor(private readonly options: DirectoryOptions) {
    const shared = {
      settleMs: options.settleMs,
      sleep: options.sleep,
      diagnostics: options.diagnostics,
      log: options.log,
      changed: (): void => {
        this.refresh();
      },
    };
    this.live = new JsonFiles({
      ...shared,
      recursive: false,
      source: 'live_session',
      directory: options.locations.sessions,
      accepts: (name): boolean => LIVE_FILE_NAME.test(name),
      schema: LIVE_FILE,
    });
    this.index = new JsonFiles({
      ...shared,
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
    await Promise.all([this.live.start(), this.index.start()]);
    this.refresh();
    this.quiet = false;
  }

  stop(): void {
    this.live.stop();
    this.index.stop();
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

  socketOf(id: string): string | null {
    return this.viewOf(id).source.live?.file.messagingSocketPath ?? null;
  }

  userMessages(id: string): number {
    return this.userMessageCounts.get(id) ?? 0;
  }

  whenRunning(id: string, milliseconds: number): Promise<boolean> {
    return this.waitFor(
      () =>
        this.tails.followed().has(id) &&
        this.views.some((view) => view.row.id === id && view.row.state !== 'stopped'),
      milliseconds,
    );
  }

  whenUserMessage(id: string, after: number, milliseconds: number): Promise<boolean> {
    return this.waitFor(() => this.userMessages(id) > after, milliseconds);
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

  private waitFor(check: () => boolean, milliseconds: number): Promise<boolean> {
    if (check()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean): void => {
        if (!settled) {
          settled = true;
          this.watchers.delete(look);
          resolve(value);
        }
      };
      const look = (): void => {
        if (check()) {
          finish(true);
        }
      };
      this.watchers.add(look);
      void this.options.sleep(milliseconds).then(() => {
        finish(false);
      });
    });
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
    return file.procStart === undefined ? null : processStart(file.pid) === file.procStart;
  }

  private liveSources(): LiveSource[] {
    const sources: LiveSource[] = [];
    for (const [name, entry] of this.live.all()) {
      const file = entry.value;
      if (file.kind !== undefined && file.kind !== 'interactive') {
        continue;
      }
      if (file.pidDomain !== undefined && !file.pidDomain.endsWith(this.namespace)) {
        this.options.diagnostics.report('live_session', name, 'belongs to another pid namespace');
        continue;
      }
      sources.push({
        file,
        present: entry.present,
        alive: entry.present ? this.aliveOf(file) : false,
      });
    }
    return sources;
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
    this.views = views;
    this.syncTails(views);
    this.announce(views);
    for (const watcher of [...this.watchers]) {
      watcher();
    }
    return views;
  }

  private capabilitiesFor(source: SessionSources, running: boolean): ClaudeCapabilities {
    const { plane } = this.options;
    return capabilitiesOf({
      running,
      link: plane.link(),
      controller: plane.controller(),
      ...plane.sessionLink(source.id),
      listed: (source.index?.sessionId ?? source.live?.file.hostSessionId) !== undefined,
      socket: source.live?.file.messagingSocketPath !== undefined,
      resumable: RESUMABLE_ID.test(source.id),
    });
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
      for (const watcher of [...this.watchers]) {
        watcher();
      }
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
    const users = items.filter((item) => item.kind === 'user' && !item.meta).length;
    if (users > 0) {
      this.userMessageCounts.set(sessionId, this.userMessages(sessionId) + users);
      for (const watcher of [...this.watchers]) {
        watcher();
      }
    }
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
