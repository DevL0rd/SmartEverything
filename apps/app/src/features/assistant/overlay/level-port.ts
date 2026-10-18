import { OVERLAY_LEVELS_PORT_MESSAGE, type OverlayView } from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import type { CallLevelListener, CallLevels } from '../call/engine/call-engine';
import { callEngine } from '../call/engine/engine';
import { onHostedLevels } from './hosted-voice';

export const CALM_LEVEL_MS = 100;

export interface LevelChannel {
  readonly post: (message: {
    readonly in: number;
    readonly out: number;
    readonly at: number;
  }) => void;
  readonly close: () => void;
}

export interface LevelPorts {
  readonly subscribe: (listener: CallLevelListener) => () => void;
  readonly open: () => LevelChannel | null;
  readonly now: () => number;
  readonly after: (ms: number, run: () => void) => () => void;
}

const SILENT: CallLevels = { in: 0, out: 0 };

export class LevelPort {
  private off: (() => void) | null = null;
  private channel: LevelChannel | null = null;
  private callId: string | null = null;
  private interval = 0;
  private lastAt = Number.NEGATIVE_INFINITY;
  private cancelTrailing: (() => void) | null = null;

  constructor(private readonly ports: LevelPorts) {}

  follow(view: OverlayView | null, callId: string | null): void {
    if (callId !== this.callId) {
      this.release();
      this.callId = callId;
    }
    const wanted = view !== null && view.state !== 'hidden' && view.level !== null;
    this.interval = view?.mode === 'full' ? 0 : CALM_LEVEL_MS;
    if (wanted && this.off === null) {
      this.listen();
    } else if (!wanted && this.off !== null) {
      this.stopListening();
      this.send(SILENT);
    }
  }

  close(): void {
    this.release();
    this.callId = null;
  }

  private listen(): void {
    this.channel ??= this.ports.open();
    if (this.channel === null) {
      return;
    }
    this.off = this.ports.subscribe((levels) => {
      this.offer(levels);
    });
  }

  private stopListening(): void {
    this.off?.();
    this.off = null;
    this.cancelTrailing?.();
    this.cancelTrailing = null;
  }

  private release(): void {
    this.stopListening();
    this.channel?.close();
    this.channel = null;
  }

  private offer(levels: CallLevels): void {
    const waited = this.ports.now() - this.lastAt;
    this.cancelTrailing?.();
    this.cancelTrailing = null;
    if (waited >= this.interval) {
      this.send(levels);
      return;
    }
    this.cancelTrailing = this.ports.after(this.interval - waited, () => {
      this.cancelTrailing = null;
      this.send(levels);
    });
  }

  private send(levels: CallLevels): void {
    this.lastAt = this.ports.now();
    this.channel?.post({ in: levels.in, out: levels.out, at: this.lastAt });
  }
}

function openLevelChannel(): LevelChannel | null {
  if (desktopBridge()?.setOverlay === undefined) {
    return null;
  }
  const { port1, port2 } = new MessageChannel();
  window.postMessage(OVERLAY_LEVELS_PORT_MESSAGE, window.location.origin, [port2]);
  return {
    post: (message): void => {
      port1.postMessage(message);
    },
    close: (): void => {
      port1.close();
    },
  };
}

const noop = (): void => undefined;

export const CALL_LEVEL_PORTS: LevelPorts = {
  subscribe: (listener) => {
    const stopEngine =
      callEngine.levels.kind === 'events' ? callEngine.levels.subscribe(listener) : noop;
    const stopHosted = onHostedLevels(listener);
    return (): void => {
      stopEngine();
      stopHosted();
    };
  },
  open: openLevelChannel,
  now: () => performance.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return (): void => {
      clearTimeout(timer);
    };
  },
};
