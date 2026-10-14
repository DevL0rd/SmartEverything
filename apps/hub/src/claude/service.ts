import { join } from 'node:path';
import {
  type ClaudeAnswer,
  type ClaudeControl,
  type ClaudeControlled,
  type ClaudeController,
  type ClaudeControllerRegistration,
  type ClaudeLink,
  type ClaudeNotice,
  type ClaudePrompt,
  type ClaudeSession,
  type ClaudeStart,
  type ClaudeStarted,
  type ClaudeStatus,
  type ClaudeThreadPage,
  type ClaudeUsage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { ClaudeControlPlane } from './control-plane';
import { Diagnostics } from './diagnostics';
import { ClaudeNotReadyError } from './errors';
import type { Requester } from './prompt-broker';
import { JsonSnapshots } from './json-snapshots';
import type { ClaudeLocations } from './locations';
import { PLAN_USAGE_FILE, PLAN_USAGE_FILE_NAME, usageOf, type PlanUsageFile } from './plan-usage';
import { SessionDirectory } from './session-directory';

const SETTLE_MS = 75;

export interface SessionQuery {
  readonly state?: ClaudeSession['state'] | undefined;
  readonly archived: boolean;
  readonly limit: number;
}

export interface ThreadQuery {
  readonly before?: string | undefined;
  readonly limit: number;
}

export interface ClaudeServiceOptions {
  readonly locations: ClaudeLocations;
  readonly historyDirectory: string;
  readonly plane: ClaudeControlPlane;
  readonly clock: Clock;
  readonly publish: (notice: ClaudeNotice) => void;
  readonly log: Logger;
}

interface Watching {
  readonly directory: SessionDirectory;
  readonly plan: JsonSnapshots<PlanUsageFile>;
}

function byRecency(left: ClaudeSession, right: ClaudeSession): number {
  const running = Number(right.state !== 'stopped') - Number(left.state !== 'stopped');
  return running === 0 ? (right.updated_at ?? '').localeCompare(left.updated_at ?? '') : running;
}

function usageFrom(plan: JsonSnapshots<PlanUsageFile>): ClaudeUsage {
  return usageOf([...plan.all().values()].find((entry) => entry.present)?.value);
}

export class ClaudeService {
  private readonly watching: Watching;
  private readonly diagnostics: Diagnostics;
  private booted: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  private lastStatus: string | null = null;
  private readonly listeners = new Set<(notice: ClaudeNotice) => void>();

  constructor(private readonly options: ClaudeServiceOptions) {
    this.diagnostics = new Diagnostics(options.log);
    this.diagnostics.report(
      'desktop_index',
      'runtime',
      'Claude Desktop runtime control is retired. Legacy metadata and transcripts remain readable; use owned CLI chats.',
    );
    this.watching = this.watch();
  }

  start(): void {
    const { watching } = this;
    this.unsubscribe = this.options.plane.onChange(() => {
      watching.directory.reevaluate();
    });
    this.booted = this.boot(watching);
    this.booted.catch((cause: unknown) => {
      this.options.log.error('boot.failed', cause);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.watching.directory.stop();
    this.listeners.clear();
  }

  onNotice(listener: (notice: ClaudeNotice) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(notice: ClaudeNotice): void {
    this.options.publish(notice);
    for (const listener of this.listeners) {
      listener(notice);
    }
  }

  async status(): Promise<ClaudeStatus> {
    await this.ready();
    return this.statusNow();
  }

  async sessions(query: SessionQuery): Promise<ClaudeSession[]> {
    const { directory } = await this.ready();
    return directory
      .sessions()
      .filter(
        (session) =>
          session.archived === query.archived &&
          (query.state === undefined || session.state === query.state),
      )
      .sort(byRecency)
      .slice(0, query.limit);
  }

  async session(id: string): Promise<ClaudeSession> {
    return (await this.ready()).directory.session(id);
  }

  async thread(id: string, query: ThreadQuery): Promise<ClaudeThreadPage> {
    const { directory } = await this.ready();
    return directory.thread(
      id,
      query.before === undefined ? null : Number(query.before),
      query.limit,
    );
  }

  async usage(): Promise<ClaudeUsage> {
    const { plan } = await this.ready();
    await plan.refresh();
    const file = usageFrom(plan);
    const live = this.options.plane.usage();
    return (live.sampled_at ?? '') > (file.sampled_at ?? '') ? live : file;
  }

  prompts(sessionId: string | undefined): ClaudePrompt[] {
    return this.options.plane
      .prompts()
      .filter((prompt) => sessionId === undefined || prompt.session_id === sessionId);
  }

  control(_id: string, _body: ClaudeControl): Promise<ClaudeControlled> {
    return Promise.reject(
      new ClaudeNotReadyError(
        'control',
        'Legacy sessions are read-only. Use the owned Claude CLI chat controls.',
      ),
    );
  }

  answer(promptId: string, body: ClaudeAnswer, requester: Requester): Promise<ClaudePrompt> {
    return this.options.plane.answer(promptId, body, requester);
  }

  startSession(_body: ClaudeStart): Promise<ClaudeStarted> {
    return Promise.reject(
      new ClaudeNotReadyError(
        'start',
        'Update the app and start an owned Claude CLI chat from computer settings.',
      ),
    );
  }

  installLink(): Promise<ClaudeLink> {
    return this.options.plane.installLink();
  }

  removeLink(): Promise<ClaudeLink> {
    return this.options.plane.removeLink();
  }

  registerController(): Promise<ClaudeControllerRegistration> {
    return this.options.plane.registerController();
  }

  removeController(): Promise<ClaudeController> {
    return this.options.plane.removeController();
  }

  private watch(): Watching {
    const { locations, clock, log } = this.options;
    const announce = (): void => {
      queueMicrotask(() => {
        this.announceStatus();
      });
    };
    const directory = new SessionDirectory({
      locations,
      historyDirectory: this.options.historyDirectory,
      plane: this.options.plane,
      diagnostics: this.diagnostics,
      sleep: clock.sleep,
      settleMs: SETTLE_MS,
      log,
      publish: (notice): void => {
        this.publish(notice);
        announce();
      },
    });
    const plan = new JsonSnapshots({
      source: 'plan_usage',
      directory: locations.desktop,
      recursive: false,
      accepts: (name): boolean => name === PLAN_USAGE_FILE_NAME,
      schema: PLAN_USAGE_FILE,
      diagnostics: this.diagnostics,
      snapshot: join(this.options.historyDirectory, 'legacy-plan-usage.json'),
    });
    return { directory, plan };
  }

  private async boot(watching: Watching): Promise<void> {
    await Promise.all([watching.directory.start(), watching.plan.refresh()]);
    this.lastStatus = JSON.stringify(this.statusNow());
  }

  private async ready(): Promise<Watching> {
    await this.booted;
    await this.watching.directory.refreshHistory();
    return this.watching;
  }

  private statusNow(): ClaudeStatus {
    const { watching } = this;
    const summary = watching.directory.summary();
    return {
      desktop: {
        state: 'unsupported_platform',
        cli_version: summary.cliVersion,
      },
      link: { state: this.options.plane.link(), problem: this.options.plane.linkProblem() },
      controller: { state: this.options.plane.controller() },
      sessions: { live: summary.live, total: summary.total },
      usage: usageFrom(watching.plan),
      diagnostics: this.diagnostics.list(),
    };
  }

  private announceStatus(): void {
    if (this.lastStatus === null) {
      return;
    }
    const status = this.statusNow();
    const text = JSON.stringify(status);
    if (text !== this.lastStatus) {
      this.lastStatus = text;
      this.options.log.info('status.changed', { desktop: status.desktop.state });
      this.publish({ type: 'claude_status', status });
    }
  }
}
