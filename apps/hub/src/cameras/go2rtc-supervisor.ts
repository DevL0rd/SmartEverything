import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { IceServer } from '@smarteverything/domain';
import type { StoredAccount } from '../adapters/contract';
import { startGo2rtc, type Go2rtcLaunch, type RunningGo2rtc } from './go2rtc-process';

export type Go2rtcOptions = Omit<Go2rtcLaunch, 'password' | 'xiaomi' | 'candidates' | 'iceServers'>;

export type Start = (launch: Go2rtcLaunch) => Promise<RunningGo2rtc>;

const XIAOMI_CAMERA_LOGIN = z.object({ userId: z.string().min(1), passToken: z.string().min(1) });

class XiaomiCameraLoginError extends Error {
  override readonly name = 'XiaomiCameraLoginError';

  constructor(issues: number) {
    super(
      `The stored Xiaomi account has no usable userId and passToken for go2rtc; ${String(issues)} field(s) are missing or empty.`,
    );
  }
}

export function xiaomiLoginsOf(account: StoredAccount | null): Readonly<Record<string, string>> {
  if (account === null) {
    return {};
  }
  const login = XIAOMI_CAMERA_LOGIN.safeParse(account.secrets);
  if (!login.success) {
    throw new XiaomiCameraLoginError(login.error.issues.length);
  }
  return { [login.data.userId]: login.data.passToken };
}

export interface Go2rtcConfig {
  readonly xiaomi: Readonly<Record<string, string>>;
  readonly candidates: readonly string[];
  readonly iceServers: readonly IceServer[];
}

class Go2rtcNotRunningError extends Error {
  override readonly name = 'Go2rtcNotRunningError';

  constructor() {
    super('go2rtc is not running; it must be started before it is restarted or stopped.');
  }
}

export class Go2rtcSupervisor {
  readonly password = randomBytes(24).toString('hex');
  private running: RunningGo2rtc | null = null;
  private config: Go2rtcConfig | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: Go2rtcOptions,
    private readonly launch: Start = startGo2rtc,
  ) {}

  isRunning(): boolean {
    return this.running !== null;
  }

  async start(config: Go2rtcConfig): Promise<RunningGo2rtc> {
    this.config = config;
    this.options.log.debug('go2rtc.starting', () => ({
      xiaomiLogins: Object.keys(config.xiaomi).length,
      candidates: config.candidates.length,
      iceServers: config.iceServers.length,
    }));
    const running = await this.launch({ ...this.options, ...config, password: this.password });
    this.running = running;
    return running;
  }

  apply(change: Partial<Go2rtcConfig>): Promise<boolean> {
    const apply = (): Promise<boolean> => this.restartWith(change);
    const applied = this.queue.then(apply, apply);
    this.queue = applied.then(
      () => undefined,
      () => undefined,
    );
    return applied;
  }

  async stop(): Promise<void> {
    const running = this.running;
    if (running === null) {
      throw new Go2rtcNotRunningError();
    }
    this.running = null;
    await running.stop();
  }

  private async restartWith(change: Partial<Go2rtcConfig>): Promise<boolean> {
    const current = this.config;
    if (current === null) {
      throw new Go2rtcNotRunningError();
    }
    const next = { ...current, ...change };
    if (JSON.stringify(next) === JSON.stringify(current)) {
      return false;
    }
    try {
      await this.stop();
      await this.start(next);
    } catch (cause) {
      this.options.exited(cause instanceof Error ? cause : new Error(String(cause)));
      throw cause;
    }
    this.options.log.info('go2rtc.restarted', { changed: Object.keys(change).join(',') });
    return true;
  }
}
