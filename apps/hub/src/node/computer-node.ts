import type {
  ComputerSessionState,
  ComputerSnapshot,
  HubFrame,
  NodeHello,
  NodePace,
  NodeRequest,
  PowerAction,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerCollector } from './collectors/collector';
import type { ComputerControls } from './controls/controls';
import type { NodeLink } from './link';
import { failureOf, NodeFailureError } from './node-failure';
import { NodeRequestHandler } from './request-handler';

export const PACE_MS: Readonly<Record<NodePace, number>> = { live: 1000, idle: 10_000 };

export interface ComputerNodeOptions {
  readonly collector: ComputerCollector;
  readonly controls: ComputerControls;
  readonly link: NodeLink;
  readonly now: () => Date;
  readonly log: Logger;
}

export function signatureOf(snapshot: ComputerSnapshot): string {
  const { at: _at, uptimeSeconds: _uptime, ...measured } = snapshot;
  return JSON.stringify(measured, (_key, value: unknown) =>
    typeof value === 'number' ? Math.round(value * 10) / 10 : value,
  );
}

export class ComputerNode {
  private pace: NodePace = 'idle';
  private timer: NodeJS.Timeout | null = null;
  private signature = '';
  private unsubscribe: (() => void) | null = null;
  private failure: string | null = null;
  private hello: NodeHello | null = null;
  private session: ComputerSessionState | null = null;
  private readonly handler: NodeRequestHandler;

  constructor(private readonly options: ComputerNodeOptions) {
    this.handler = new NodeRequestHandler(options.controls);
  }

  start(): void {
    this.unsubscribe = this.options.link.onFrame((frame) => {
      this.received(frame);
    });
    void this.greet();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.halt();
    this.hello = null;
    this.options.collector.stop();
    this.options.controls.processes.stop();
    this.session = null;
    this.options.controls.session.stop().catch((cause: unknown) => {
      this.options.log.error('node.session_stop_failed', cause);
    });
  }

  private async greet(): Promise<void> {
    const { collector, link, now } = this.options;
    const hello = { ...collector.hello(now()), power: await this.powerActions() };
    if (this.unsubscribe === null) {
      return;
    }
    this.hello = hello;
    link.send({ type: 'hello', hello });
    collector.pace(PACE_MS[this.pace]);
    this.tick();
    await this.watchSession();
  }

  private async watchSession(): Promise<void> {
    try {
      await this.options.controls.session.start((session) => {
        this.session = session;
        this.sendSession();
      });
    } catch (cause) {
      this.options.log.error('node.session_unavailable', cause);
    }
  }

  private sendSession(): void {
    const session = this.session;
    if (session === null || this.unsubscribe === null) {
      return;
    }
    const visible = this.handler.allows('apps') ? session : { ...session, focused: null };
    this.options.link.send({ type: 'session', session: visible });
  }

  private async powerActions(): Promise<PowerAction[]> {
    try {
      return await this.options.controls.power.available();
    } catch (cause) {
      this.options.log.error('node.power_unknown', cause);
      return [];
    }
  }

  private received(frame: HubFrame): void {
    if (frame.type === 'request') {
      void this.answer(frame.id, frame.request);
      return;
    }
    if (frame.type === 'scopes') {
      this.handler.allow(frame.scopes);
      this.restart();
      this.sendSession();
      return;
    }
    if (frame.pace !== this.pace) {
      this.pace = frame.pace;
      this.options.collector.pace(PACE_MS[this.pace]);
      this.restart();
    }
  }

  private async answer(id: string, request: NodeRequest): Promise<void> {
    const hello = this.hello;
    try {
      if (hello === null) {
        throw new NodeFailureError('failed', 'The computer is still starting.');
      }
      const value = await this.handler.handle(request, hello);
      this.options.link.send({ type: 'reply', id, result: { ok: true, value } });
    } catch (cause) {
      this.options.link.send({
        type: 'reply',
        id,
        result: { ok: false, failure: failureOf(cause) },
      });
    }
  }

  private restart(): void {
    this.halt();
    if (this.hello !== null) {
      this.tick();
    }
  }

  private halt(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.handler.allows('metrics')) {
      return;
    }
    const started = Date.now();
    this.sample();
    const wait = Math.max(0, PACE_MS[this.pace] - (Date.now() - started));
    this.timer = setTimeout(() => {
      this.tick();
    }, wait);
  }

  private sample(): void {
    try {
      const snapshot = this.options.collector.snapshot(this.options.now());
      const signature = signatureOf(snapshot);
      this.failure = null;
      if (signature !== this.signature) {
        this.signature = signature;
        this.options.link.send({ type: 'snapshot', snapshot });
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (reason !== this.failure) {
        this.failure = reason;
        this.options.log.error('node.sample_failed', cause);
      }
    }
  }
}
