import { Logger, messageOf } from '@smarteverything/logging';
import { IntegrationError } from './integration-error';
import type { OneShotPicture } from './one-shot-model';

const log = new Logger('hub.automations');

export interface AgentLaunch {
  readonly profileId: string;
  readonly role: 'owner' | 'member';
  readonly automationId: string;
  readonly model: string | null;
  readonly tools: readonly string[];
}

export interface AgentMessage {
  readonly text: string;
  readonly pictures: readonly OneShotPicture[];
}

export interface AgentSpend {
  readonly tokens: number;
  readonly costUsd: number;
}

export interface AgentSession {
  readonly say: (message: AgentMessage) => Promise<string>;
  readonly spent: () => AgentSpend;
  readonly onSpend: (listener: (spend: AgentSpend) => void) => () => void;
  readonly interrupt: () => Promise<void>;
  readonly end: () => Promise<void>;
}

export interface AgentHost {
  readonly open: (launch: AgentLaunch) => AgentSession;
}

export class AgentCancelledError extends Error {
  override readonly name = 'AgentCancelledError';

  constructor() {
    super('The automation run was cancelled.');
  }
}

export interface AgentLimits {
  readonly signal: AbortSignal;
  readonly capUsd: number | null;
}

class Stopped extends Error {
  override readonly name = 'Stopped';

  constructor(readonly reason: Error) {
    super(reason.message);
  }
}

function overCap(spend: AgentSpend, cap: number | null): boolean {
  return cap !== null && spend.costUsd > cap;
}

function capError(cap: number): IntegrationError {
  return new IntegrationError(
    'LimitExceeded',
    `The AI call cost more than the cap of ${String(cap)} USD.`,
  );
}

export class DshAgentRun {
  constructor(
    private readonly session: AgentSession,
    private readonly limits: AgentLimits,
  ) {}

  spent(): AgentSpend {
    return this.session.spent();
  }

  async say(message: AgentMessage): Promise<string> {
    const { signal, capUsd } = this.limits;
    if (signal.aborted) throw new AgentCancelledError();
    let release = (): void => undefined;
    const guard = new Promise<never>((_resolve, reject) => {
      const stop = (reason: Error): void => {
        reject(new Stopped(reason));
      };
      const abort = (): void => {
        stop(new AgentCancelledError());
      };
      signal.addEventListener('abort', abort, { once: true });
      const unwatch = this.session.onSpend((spend) => {
        if (capUsd !== null && overCap(spend, capUsd)) stop(capError(capUsd));
      });
      release = (): void => {
        signal.removeEventListener('abort', abort);
        unwatch();
      };
    });
    const answer = this.session.say(message);
    try {
      const text = await Promise.race([answer, guard]);
      this.assertWithinCap();
      return text;
    } catch (cause) {
      if (!(cause instanceof Stopped)) throw cause;
      await this.interrupted(answer);
      throw cause.reason;
    } finally {
      release();
    }
  }

  async end(): Promise<void> {
    await this.session.end();
  }

  private assertWithinCap(): void {
    const { capUsd } = this.limits;
    if (capUsd !== null && overCap(this.session.spent(), capUsd)) throw capError(capUsd);
  }

  private async interrupted(answer: Promise<string>): Promise<void> {
    await this.session.interrupt();
    await answer.then(
      () => undefined,
      (cause: unknown) => {
        log.debug('automation.agent_interrupted', () => ({ reason: messageOf(cause) }));
      },
    );
  }
}
