import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  conversationExists,
  deliver,
  liveSession,
  openInDesktop,
  sessionsDirectory,
  showInDesktop,
  transcriptPath,
  type LiveSession,
} from './claude-sessions';
import { claudeProgram } from './executables';
import { watchDirectory } from './file-watch';
import { runFile } from './run';
import { SessionActivity } from './session-activity';
import { isMissing } from './errors';

const STATE = z.strictObject({
  sessionId: z.uuid(),
  workspace: z.string(),
  briefed: z.string().optional(),
});

type RouterState = z.infer<typeof STATE>;

const PICKUP_WAIT_MS = 8000;
const CREATE_TIMEOUT_MS = 180_000;
const DELIVERED_KEPT = 500;
const NUDGE = 'Please handle the pending SmartEverything request above.';

export interface RoutedRequest {
  readonly eventId: string;
  readonly text: string;
}

export interface RouterHooks {
  readonly statePath: string;
  readonly workspace: string;
  readonly name: string;
  readonly model: () => string | null;
  readonly effort: () => string | null;
  readonly activity: () => boolean;
  readonly brief: (sessionId: string | null) => string;
  readonly pickedUp: (eventId: string) => void;
  readonly step: (eventId: string, step: string) => void;
  readonly replied: (eventId: string) => void;
  readonly settled: (eventId: string) => void;
  readonly changed: () => void;
}

function greeting(name: string, brief: string): string {
  return `This is the ${name} conversation. SmartEverything will deliver requests typed or spoken in its app here for you to answer with the assistant_reply tool (pass the eventId you are given).\n\n${brief}\n\nReply with: Ready.`;
}

function rebriefing(brief: string): string {
  return `[Updated SmartEverything instructions for requests from SmartEverything; they replace earlier SmartEverything instructions only, and any other standing instructions in this conversation still apply]\n${brief}`;
}

export class SessionRouter {
  live: LiveSession | null = null;
  private sessionId: string | null = null;
  private briefed: string | null = null;
  private unwatch: (() => void) | null = null;
  private delivered: string[] = [];
  private readonly picked = new Set<string>();
  private readonly activity: SessionActivity;

  constructor(private readonly hooks: RouterHooks) {
    this.activity = new SessionActivity(
      {
        step: hooks.step,
        pickedUp: (eventId): void => {
          this.picked.add(eventId);
          hooks.pickedUp(eventId);
        },
        replied: hooks.replied,
      },
      hooks.activity,
    );
  }

  async start(): Promise<void> {
    const saved = await this.savedState();
    this.sessionId = saved?.sessionId ?? null;
    this.briefed = saved?.briefed ?? null;
    await mkdir(sessionsDirectory(), { recursive: true });
    this.unwatch = watchDirectory(sessionsDirectory(), () => void this.refresh(), 200);
    await this.refresh();
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.activity.stop();
    this.picked.clear();
  }

  async reset(): Promise<void> {
    await rm(this.hooks.statePath, { force: true });
    this.sessionId = null;
    this.briefed = null;
    this.live = null;
    this.activity.stop();
    this.picked.clear();
  }

  get conversationId(): string | null {
    return this.sessionId;
  }

  get busy(): boolean {
    return this.live?.status === 'busy';
  }

  async open(): Promise<void> {
    if (this.sessionId === null) {
      throw new Error('The conversation is created with the first request.');
    }
    await showInDesktop(this.sessionId);
  }

  async route(request: RoutedRequest): Promise<void> {
    if (this.delivered.includes(request.eventId)) {
      return;
    }
    const sessionId = await this.conversation();
    const live = (await liveSession(sessionId)) ?? (await openInDesktop(sessionId));
    this.live = live;
    const transcript = await transcriptPath(sessionId);
    if (transcript !== undefined) {
      await this.activity.follow(transcript, request.eventId);
    }
    await deliver(live, await this.withBrief(request.text));
    this.delivered = [...this.delivered, request.eventId].slice(-DELIVERED_KEPT);
    void this.confirm(live, request.eventId);
  }

  private async confirm(live: LiveSession, eventId: string): Promise<void> {
    if (await this.activity.pickedUp(eventId, PICKUP_WAIT_MS)) {
      return;
    }
    if ((await liveSession(live.sessionId))?.status !== 'idle') {
      return;
    }
    await deliver(live, NUDGE).catch(() => undefined);
  }

  private async conversation(): Promise<string> {
    if (this.sessionId !== null && (await conversationExists(this.sessionId))) {
      return this.sessionId;
    }
    return this.create();
  }

  private async create(): Promise<string> {
    const sessionId = randomUUID();
    const model = this.hooks.model();
    const effort = this.hooks.effort();
    const options = [
      ...(model === null ? [] : ['--model', model]),
      ...(effort === null ? [] : ['--effort', effort]),
    ];
    const claude = await claudeProgram();
    const brief = this.hooks.brief(sessionId);
    await runFile(
      claude.command,
      [
        ...claude.args,
        '-p',
        '--session-id',
        sessionId,
        '--name',
        this.hooks.name,
        ...options,
        greeting(this.hooks.name, brief),
      ],
      { cwd: this.hooks.workspace, timeoutMs: CREATE_TIMEOUT_MS },
    );
    if (!(await conversationExists(sessionId))) {
      throw new Error('Claude Code did not create the assistant conversation');
    }
    this.sessionId = sessionId;
    this.briefed = brief;
    await this.save();
    return sessionId;
  }

  private async withBrief(message: string): Promise<string> {
    const brief = this.hooks.brief(this.sessionId);
    if (brief === this.briefed) {
      return message;
    }
    this.briefed = brief;
    await this.save();
    return `${rebriefing(brief)}\n\n${message}`;
  }

  private async savedState(): Promise<RouterState | undefined> {
    let text: string;
    try {
      text = await readFile(this.hooks.statePath, 'utf8');
    } catch (cause) {
      if (!isMissing(cause)) {
        throw cause;
      }
      return undefined;
    }
    const parsed = STATE.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.workspace === this.hooks.workspace
      ? parsed.data
      : undefined;
  }

  private async save(): Promise<void> {
    if (this.sessionId === null) {
      return;
    }
    const state: RouterState = {
      sessionId: this.sessionId,
      workspace: this.hooks.workspace,
      ...(this.briefed === null ? {} : { briefed: this.briefed }),
    };
    await mkdir(dirname(this.hooks.statePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.hooks.statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, this.hooks.statePath);
  }

  private async refresh(): Promise<void> {
    this.live = this.sessionId === null ? null : ((await liveSession(this.sessionId)) ?? null);
    this.hooks.changed();
    if (this.live !== null && this.live.status !== 'idle') {
      return;
    }
    [...this.picked].forEach((eventId) => {
      this.picked.delete(eventId);
      this.hooks.settled(eventId);
    });
  }
}
