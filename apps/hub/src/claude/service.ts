import { platform } from 'node:process';
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
import type { ClaudeControlPlane, ControlTarget } from './control-plane';
import { SINGLETON_LOCK, desktopStateOf } from './desktop-state';
import { Diagnostics } from './diagnostics';
import { ClaudeNotReadyError } from './errors';
import type { Requester } from './prompt-broker';
import { PathWatch } from './fs-watch';
import { JsonFiles } from './json-files';
import type { ClaudeLocations } from './locations';
import {
  PLAN_USAGE_FILE,
  PLAN_USAGE_FILE_NAME,
  NO_USAGE,
  usageOf,
  type PlanUsageFile,
} from './plan-usage';
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
  readonly plane: ClaudeControlPlane;
  readonly clock: Clock;
  readonly publish: (notice: ClaudeNotice) => void;
  readonly log: Logger;
}

interface Watching {
  readonly directory: SessionDirectory;
  readonly plan: JsonFiles<PlanUsageFile>;
  readonly lock: PathWatch;
}

function byRecency(left: ClaudeSession, right: ClaudeSession): number {
  const running = Number(right.state !== 'stopped') - Number(left.state !== 'stopped');
  return running === 0 ? (right.updated_at ?? '').localeCompare(left.updated_at ?? '') : running;
}

function usageFrom(plan: JsonFiles<PlanUsageFile>): ClaudeUsage {
  return usageOf([...plan.all().values()].find((entry) => entry.present)?.value);
}

export class ClaudeService {
  private readonly watching: Watching | null;
  private readonly diagnostics: Diagnostics;
  private booted: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  private lastStatus: string | null = null;

  constructor(private readonly options: ClaudeServiceOptions) {
    this.diagnostics = new Diagnostics(options.log);
    this.watching = platform === 'linux' ? this.watch() : null;
  }

  start(): void {
    const { watching } = this;
    if (watching === null) {
      return;
    }
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
    this.watching?.directory.stop();
    this.watching?.plan.stop();
    this.watching?.lock.stop();
  }

  async status(): Promise<ClaudeStatus> {
    await this.booted;
    return this.statusNow();
  }

  async sessions(query: SessionQuery): Promise<ClaudeSession[]> {
    const { directory } = await this.ready('sessions');
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
    return (await this.ready('sessions')).directory.session(id);
  }

  async thread(id: string, query: ThreadQuery): Promise<ClaudeThreadPage> {
    const { directory } = await this.ready('messages');
    return directory.thread(
      id,
      query.before === undefined ? null : Number(query.before),
      query.limit,
    );
  }

  async usage(): Promise<ClaudeUsage> {
    const file = usageFrom((await this.ready('usage')).plan);
    const live = this.options.plane.usage();
    return (live.sampled_at ?? '') > (file.sampled_at ?? '') ? live : file;
  }

  prompts(sessionId: string | undefined): ClaudePrompt[] {
    return this.options.plane
      .prompts()
      .filter((prompt) => sessionId === undefined || prompt.session_id === sessionId);
  }

  async control(id: string, body: ClaudeControl): Promise<ClaudeControlled> {
    const { directory } = await this.ready('control');
    const target: ControlTarget = {
      session: directory.session(id),
      socket: directory.socketOf(id),
      ops: {
        socketOf: (sessionId) => directory.socketOf(sessionId),
        whenRunning: (sessionId, ms) => directory.whenRunning(sessionId, ms),
        userMessages: (sessionId) => directory.userMessages(sessionId),
        whenUserMessage: (sessionId, after, ms) => directory.whenUserMessage(sessionId, after, ms),
      },
    };
    const delivery = await this.options.plane.control(target, body);
    const session = directory.session(id);
    return delivery === null ? session : { ...session, delivery };
  }

  answer(promptId: string, body: ClaudeAnswer, requester: Requester): Promise<ClaudePrompt> {
    return this.options.plane.answer(promptId, body, requester);
  }

  async startSession(body: ClaudeStart): Promise<ClaudeStarted> {
    await this.ready('start');
    return this.options.plane.start(body);
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
      plane: this.options.plane,
      diagnostics: this.diagnostics,
      sleep: clock.sleep,
      settleMs: SETTLE_MS,
      log,
      publish: (notice): void => {
        this.options.publish(notice);
        announce();
      },
    });
    const plan = new JsonFiles({
      source: 'plan_usage',
      directory: locations.desktop,
      recursive: false,
      accepts: (name): boolean => name === PLAN_USAGE_FILE_NAME,
      schema: PLAN_USAGE_FILE,
      settleMs: SETTLE_MS,
      sleep: clock.sleep,
      diagnostics: this.diagnostics,
      log,
      changed: announce,
    });
    const lock = new PathWatch({
      directory: locations.desktop,
      recursive: false,
      settleMs: SETTLE_MS,
      accepts: (name): boolean => name === SINGLETON_LOCK,
      changed: announce,
      log,
    });
    return { directory, plan, lock };
  }

  private async boot(watching: Watching): Promise<void> {
    await Promise.all([watching.directory.start(), watching.plan.start()]);
    watching.lock.start();
    this.lastStatus = JSON.stringify(this.statusNow());
  }

  private async ready(feature: string): Promise<Watching> {
    if (this.watching === null) {
      throw new ClaudeNotReadyError(feature, 'watching Claude Desktop is only supported on Linux');
    }
    await this.booted;
    return this.watching;
  }

  private statusNow(): ClaudeStatus {
    const { watching } = this;
    const summary = watching?.directory.summary();
    return {
      desktop: {
        state: desktopStateOf(this.options.locations.desktop),
        cli_version: summary?.cliVersion ?? null,
      },
      link: { state: this.options.plane.link(), problem: this.options.plane.linkProblem() },
      controller: { state: this.options.plane.controller() },
      sessions: { live: summary?.live ?? 0, total: summary?.total ?? 0 },
      usage: watching === null ? NO_USAGE : usageFrom(watching.plan),
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
      this.options.publish({ type: 'claude_status', status });
    }
  }
}
