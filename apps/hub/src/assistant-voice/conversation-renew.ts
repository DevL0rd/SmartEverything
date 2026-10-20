import type { CallEnding } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import type { ConversationTrace } from './conversation-trace';
import type { LiveSession } from './gemini';
import {
  CARRY_ON_ANSWER,
  CARRY_ON_WAIT,
  type CatchUp,
  type LiveRenewal,
  type RenewPlan,
  type RenewReason,
} from './live-renewal';
import type { ReplyWatchdog } from './reply-watchdog';
import { SessionBuffer } from './session-buffer';

export const STOPPED_ANSWERING = 'The AI stopped answering; call again.';

export interface Closing {
  readonly reason: string;
  readonly code: number;
}

export interface RenewPorts {
  readonly renewal: LiveRenewal;
  readonly watchdog: ReplyWatchdog;
  readonly trace: ConversationTrace;
  readonly now: () => number;
  readonly session: () => LiveSession | null;
  readonly hold: (buffer: SessionBuffer) => void;
  readonly attach: (session: LiveSession) => void;
  readonly open: (resume: string | null, reason: RenewReason) => Promise<LiveSession>;
  readonly talking: () => boolean;
  readonly active: () => boolean;
  readonly end: (reason: CallEnding, detail: string) => Promise<void>;
}

interface Renewed {
  readonly session: LiveSession;
  readonly resumed: boolean;
  readonly catchUp: CatchUp | null;
}

interface Attaching {
  readonly reason: RenewReason;
  readonly renewed: Renewed;
  readonly buffer: SessionBuffer;
  readonly startedAt: number;
  readonly respond: boolean;
}

export class SessionRenewer {
  private renewing = false;
  private lastBuffer: SessionBuffer | null = null;

  constructor(private readonly ports: RenewPorts) {}

  async renew(reason: RenewReason, closing?: Closing): Promise<void> {
    const previous = this.ports.session();
    if (!this.ports.active() || previous === null || this.renewing) {
      return;
    }
    const plan = this.planned(reason, closing);
    if (plan === null) {
      await this.ports.end('failed', closing?.reason ?? STOPPED_ANSWERING);
      return;
    }
    this.renewing = true;
    const { buffer, respond } = this.hold(previous);
    const startedAt = this.ports.now();
    const renewed = await this.reconnect(reason, plan.resume);
    this.renewing = false;
    if (renewed === null) {
      return;
    }
    if (!this.ports.active()) {
      renewed.session.close();
      return;
    }
    this.attach({ reason, renewed, buffer, startedAt, respond });
  }

  private hold(previous: LiveSession): {
    readonly buffer: SessionBuffer;
    readonly respond: boolean;
  } {
    const { renewal, watchdog } = this.ports;
    const talking = this.ports.talking();
    const buffer = new SessionBuffer();
    if (this.lastBuffer !== null && renewal.unanswered) {
      buffer.replay(this.lastBuffer);
    }
    if (talking) {
      buffer.speaking(true);
    }
    this.ports.hold(buffer);
    previous.close();
    const owed = watchdog.owed() || watchdog.heardUnanswered;
    return { buffer, respond: owed && !talking };
  }

  private planned(reason: RenewReason, closing: Closing | undefined): RenewPlan | null {
    const { renewal, watchdog } = this.ports;
    const plan = renewal.plan(reason, closing?.code);
    this.ports.trace.renewing({
      reason,
      resumed: plan !== null && plan.resume !== null,
      ...renewal.state,
      owed: watchdog.owed(),
      toolsRunning: watchdog.toolsRunning,
      talking: this.ports.talking(),
      ...(closing === undefined ? {} : { closeCode: closing.code, closeReason: closing.reason }),
    });
    return plan;
  }

  private async reconnect(reason: RenewReason, resume: string | null): Promise<Renewed | null> {
    const { renewal, trace } = this.ports;
    if (resume !== null) {
      const catchUp = renewal.catchUp(true);
      try {
        return { session: await this.ports.open(resume, reason), resumed: true, catchUp };
      } catch (cause) {
        trace.renewFailed(cause, true);
        renewal.forget();
      }
    }
    const catchUp = renewal.catchUp(false);
    try {
      return { session: await this.ports.open(null, reason), resumed: false, catchUp };
    } catch (cause) {
      trace.renewFailed(cause, false);
      await this.ports.end('failed', messageOf(cause));
      return null;
    }
  }

  private attach(attaching: Attaching): void {
    const { reason, renewed, buffer, startedAt, respond } = attaching;
    const { session, catchUp } = renewed;
    if (catchUp !== null || respond) {
      sendCatchUp(session, catchUp, respond);
    }
    buffer.drain(session);
    this.lastBuffer = buffer;
    this.ports.attach(session);
    this.ports.watchdog.talking(this.ports.now());
    this.ports.trace.renewed({
      reason,
      resumed: renewed.resumed,
      durationMs: this.ports.now() - startedAt,
      catchUpLines: catchUp === null ? 0 : catchUp.lines,
      catchUpPictures: catchUp === null ? 0 : catchUp.pictures.length,
      respond,
    });
  }
}

function sendCatchUp(session: LiveSession, catchUp: CatchUp | null, respond: boolean): void {
  const carryOn = respond ? CARRY_ON_ANSWER : CARRY_ON_WAIT;
  if (catchUp === null) {
    session.text(carryOn, respond);
    return;
  }
  for (const picture of catchUp.pictures) {
    session.picture(picture);
  }
  session.text(`${catchUp.text}\n${carryOn}`, respond);
}
