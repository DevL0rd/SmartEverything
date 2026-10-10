import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClaudeControllerRegistration } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Cancel, Clock } from '../clock';
import { controllerFolder, writeControllerFolder } from './controller-files';
import { ClaudeControlFailedError, ClaudeControlTimeoutError, ClaudeNotReadyError } from './errors';
import { NO_ANSWER, type HookOutput } from './hook-events';
import { callOf, instructionOf, type ControllerJob } from './controller-jobs';
import type { LinkLaunch } from './link-launch';

const CONTROLLER_FILE = 'controller.json';

const REGISTRATION_MS = 600_000;

const JOB_MS = 120_000;

const REGISTRATION_TEXT = /SmartEverything controller registration ([0-9a-f-]{36})/;

const RESULT = /^(OK|FAIL):([0-9a-f-]{36})(?::(.*))?$/m;

const STORED = z.strictObject({ session_id: z.string().min(1).max(200) });

type ControllerState = 'not_registered' | 'ready' | 'busy' | 'lost';

export interface ControllerOptions {
  readonly clock: Clock;
  readonly log: Logger;
  readonly directory: string;
  readonly launch: LinkLaunch;
  readonly changed: () => void;
}

interface Current {
  readonly id: string;
  readonly job: ControllerJob;
  readonly resolve: (detail: string) => void;
  readonly reject: (error: Error) => void;
  readonly cancel: Cancel;
}

interface Queued {
  readonly job: ControllerJob;
  readonly resolve: (detail: string) => void;
  readonly reject: (error: Error) => void;
}

interface Registration {
  readonly code: string;
  readonly expires: Date;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export class ClaudeController {
  private bound: string | null = null;
  private registration: Registration | null = null;
  private held: ((output: HookOutput) => void) | null = null;
  private current: Current | null = null;
  private readonly queue: Queued[] = [];

  constructor(private readonly options: ControllerOptions) {}

  private get file(): string {
    return join(this.options.directory, CONTROLLER_FILE);
  }

  async load(): Promise<void> {
    try {
      this.bound = STORED.parse(JSON.parse(await readFile(this.file, 'utf8'))).session_id;
    } catch (cause) {
      if (!isMissing(cause)) {
        throw cause;
      }
    }
  }

  state(): ControllerState {
    if (this.bound === null) {
      return 'not_registered';
    }
    if (this.current !== null) {
      return 'busy';
    }
    return this.held === null ? 'lost' : 'ready';
  }

  sessionId(): string | null {
    return this.bound;
  }

  permits(sessionId: string, tool: string, input: Readonly<Record<string, unknown>>): boolean {
    if (sessionId !== this.bound || this.current === null) {
      return false;
    }
    const expected = callOf(this.current.job);
    const given = new Set(Object.values(input).filter((value) => typeof value === 'string'));
    return tool === expected.tool && expected.values.every((value) => given.has(value));
  }

  async begin(): Promise<ClaudeControllerRegistration> {
    const folder = await writeControllerFolder(this.options.directory, this.options.launch);
    const code = randomUUID();
    const expires = new Date(this.options.clock.now().getTime() + REGISTRATION_MS);
    this.registration = { code, expires };
    const prompt = `SmartEverything controller registration ${code}. Reply with the single word ready and stop.`;
    return {
      folder: controllerFolder(this.options.directory),
      prompt,
      deep_link: `claude://code/new?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(prompt)}`,
      expires_at: expires.toISOString(),
    };
  }

  async forget(): Promise<void> {
    this.bound = null;
    this.registration = null;
    this.held?.(NO_ANSWER);
    this.held = null;
    this.failAll(new ClaudeNotReadyError('controller', 'the controller was removed'));
    await rename(this.file, `${this.file}.removed`).catch((cause: unknown) => {
      if (!isMissing(cause)) {
        throw cause;
      }
    });
    this.options.changed();
  }

  async prompted(sessionId: string, prompt: string): Promise<void> {
    const code = REGISTRATION_TEXT.exec(prompt)?.[1];
    const { registration } = this;
    if (
      code === undefined ||
      registration?.code !== code ||
      registration.expires.getTime() < this.options.clock.now().getTime()
    ) {
      return;
    }
    this.registration = null;
    this.bound = sessionId;
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    await writeFile(this.file, JSON.stringify({ session_id: sessionId }), { mode: 0o600 });
    this.options.log.info('controller.registered', { session: sessionId });
    this.options.changed();
  }

  stopped(sessionId: string, lastMessage: string, closed: AbortSignal): Promise<HookOutput> {
    if (sessionId !== this.bound) {
      return Promise.resolve(NO_ANSWER);
    }
    this.finishCurrent(lastMessage);
    return new Promise((resolve) => {
      this.held = resolve;
      closed.addEventListener(
        'abort',
        () => {
          if (this.held === resolve) {
            this.held = null;
            this.options.log.warn('controller.lost', { session: sessionId });
            this.options.changed();
          }
        },
        { once: true },
      );
      this.options.changed();
      this.pump();
    });
  }

  run(job: ControllerJob): Promise<string> {
    const state = this.state();
    if (state === 'not_registered' || state === 'lost') {
      return Promise.reject(
        new ClaudeNotReadyError(
          'controller',
          state === 'lost'
            ? 'the controller session was closed; send any message in it to wake it'
            : 'no controller session is registered',
        ),
      );
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    const next = this.queue[0];
    if (this.held === null || this.current !== null || next === undefined) {
      return;
    }
    this.queue.shift();
    const id = randomUUID();
    const cancel = this.options.clock.at(
      new Date(this.options.clock.now().getTime() + JOB_MS),
      () => {
        this.current = null;
        this.options.changed();
        next.reject(new ClaudeControlTimeoutError(next.job.tool, 'controller', JOB_MS / 1000));
      },
    );
    this.current = { id, job: next.job, resolve: next.resolve, reject: next.reject, cancel };
    const release = this.held;
    this.held = null;
    release({ decision: 'block', reason: instructionOf(id, next.job) });
    this.options.changed();
  }

  private finishCurrent(lastMessage: string): void {
    const { current } = this;
    if (current === null) {
      return;
    }
    current.cancel();
    this.current = null;
    const match = RESULT.exec(lastMessage);
    if (match?.[2] !== current.id) {
      current.reject(
        new ClaudeControlFailedError(
          current.job.tool,
          'controller',
          'the controller session ended its turn without reporting a result',
        ),
      );
    } else if (match[1] === 'OK') {
      current.resolve(match[3] ?? '');
    } else {
      current.reject(
        new ClaudeControlFailedError(current.job.tool, 'controller', match[3] ?? 'no reason given'),
      );
    }
  }

  private failAll(error: Error): void {
    this.current?.cancel();
    this.current?.reject(error);
    this.current = null;
    for (const queued of this.queue.splice(0)) {
      queued.reject(error);
    }
  }
}
