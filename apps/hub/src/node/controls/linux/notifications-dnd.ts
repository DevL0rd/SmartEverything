import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import { SessionBus, type BusCall } from './dbus-session';
import type { ToolProbe } from './tool-probe';

const NOTIFICATIONS = {
  destination: 'org.freedesktop.Notifications',
  path: '/org/freedesktop/Notifications',
  iface: 'org.freedesktop.Notifications',
} as const;

const INHIBITED = [
  '--user',
  '--json=short',
  'get-property',
  ...Object.values(NOTIFICATIONS),
  'Inhibited',
];

const INHIBITED_REPLY = z.object({ data: z.boolean() });

const COOKIE = z.tuple([z.number().int().nonnegative()]);

export interface NotificationInhibitor {
  readonly inhibit: () => Promise<number>;
  readonly release: (cookie: number) => Promise<void>;
}

function call(member: BusCall['member'], signature: string, body: readonly unknown[]): BusCall {
  return { ...NOTIFICATIONS, member, signature, body };
}

export class BusNotificationInhibitor implements NotificationInhibitor {
  private bus: SessionBus | null = null;

  async inhibit(): Promise<number> {
    const reply = await this.connection().call(
      call('Inhibit', 'ssa{sv}', ['SmartEverything', 'Do Not Disturb', []]),
    );
    return COOKIE.parse(reply)[0];
  }

  async release(cookie: number): Promise<void> {
    await this.connection().call(call('UnInhibit', 'u', [cookie]));
  }

  close(): void {
    this.bus?.close();
    this.bus = null;
  }

  private connection(): SessionBus {
    this.bus ??= SessionBus.connect();
    return this.bus;
  }
}

export class DoNotDisturb {
  private cookie: number | null = null;

  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
    private readonly inhibitor: NotificationInhibitor,
  ) {}

  supported(): Promise<boolean> {
    return this.probe.available('busctl', INHIBITED);
  }

  async read(): Promise<boolean | null> {
    if (!(await this.supported())) {
      return null;
    }
    return INHIBITED_REPLY.parse(JSON.parse(await this.run('busctl', INHIBITED))).data;
  }

  async set(enabled: boolean): Promise<void> {
    const current = await this.read();
    if (current === null) {
      throw new NodeFailureError('not_supported', 'This desktop has no Do Not Disturb.');
    }
    if (enabled) {
      await this.turnOn(current);
      return;
    }
    await this.turnOff(current);
  }

  private async turnOn(current: boolean): Promise<void> {
    if (!current) {
      this.cookie = await this.inhibitor.inhibit();
    }
  }

  private async turnOff(current: boolean): Promise<void> {
    if (this.cookie !== null) {
      const cookie = this.cookie;
      this.cookie = null;
      await this.inhibitor.release(cookie);
      return;
    }
    if (current) {
      throw new NodeFailureError(
        'not_supported',
        'Do Not Disturb was turned on from the desktop itself; turn it off there.',
      );
    }
  }
}
