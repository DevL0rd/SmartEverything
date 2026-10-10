import type { ComputerSessionState, SessionApp } from '@smarteverything/domain';

export interface AppTime {
  readonly deviceId: string;
  readonly app: SessionApp;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

interface Running {
  readonly deviceId: string;
  readonly app: SessionApp;
  readonly since: Date;
}

export class AppFocusTracker {
  private running: Running | null = null;

  constructor(private readonly record: (time: AppTime) => void) {}

  observe(deviceId: string, session: ComputerSessionState, apps: boolean): void {
    const at = new Date(session.at);
    const app = apps && session.locked !== true ? session.focused : null;
    if (
      this.running !== null &&
      this.running.app.id === app?.id &&
      this.running.deviceId === deviceId
    ) {
      return;
    }
    this.end(at);
    this.running = app === null ? null : { deviceId, app, since: at };
  }

  end(at: Date): void {
    const running = this.running;
    this.running = null;
    if (running !== null && at > running.since) {
      this.record({
        deviceId: running.deviceId,
        app: running.app,
        startedAt: running.since,
        endedAt: at,
      });
    }
  }
}
