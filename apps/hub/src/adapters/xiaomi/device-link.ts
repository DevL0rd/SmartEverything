import type { Logger } from '@smarteverything/logging';
import type { Uplink } from '@smarteverything/xiaomi';
import type { XiaomiTiming } from './dependencies';
import { lanIo, type DeviceIo } from './device-io';
import type { TransportState } from './inventory';
import { LanPush, type PushState } from './lan-push';
import { startLoop, type Loop } from './loop';
import type { MiioClient } from './miio-client';

const MILLISECONDS_PER_SECOND = 1000;
const CLOUD_HAS_NO_PUSH =
  "the MIoT cloud pushes only to Xiaomi's own OAuth apps, so the hub reads it on a timer";

export interface LinkContext {
  readonly log: Logger;
  readonly timing: XiaomiTiming;
  readonly now: () => number;
  readonly jitter: () => number;
  readonly virtualDid: bigint;
  readonly openCloud: (did: string) => DeviceIo;
  readonly openLan: (did: string, host: string) => Promise<MiioClient>;
  readonly locate: (did: string) => Promise<string | null>;
}

export interface LinkHooks {
  readonly poll: () => Promise<void>;
  readonly readAll: () => Promise<void>;
  readonly uplink: (uplink: Uplink) => void;
  readonly changed: () => void;
}

export interface Opened {
  readonly host: string | null;
  readonly client: MiioClient | null;
  readonly io: DeviceIo;
  readonly reason: string;
}

export interface LinkSetup {
  readonly did: string;
  readonly opened: Opened;
  readonly readable: boolean;
}

interface Lan {
  readonly host: string;
  readonly client: MiioClient;
  readonly push: LanPush;
}

export function seconds(milliseconds: number): string {
  return String(milliseconds / MILLISECONDS_PER_SECOND);
}

export class DeviceLink {
  private readonly did: string;
  private readonly readable: boolean;
  private io: DeviceIo;
  private reason: string;
  private lan: Lan | null = null;
  private loop: Loop | null = null;
  private running = false;

  constructor(
    { did, opened, readable }: LinkSetup,
    private readonly context: LinkContext,
    private readonly hooks: LinkHooks,
  ) {
    this.did = did;
    this.readable = readable;
    this.io = opened.io;
    this.reason = opened.reason;
    if (opened.host !== null && opened.client !== null) {
      this.lan = this.lanOf(opened.host, opened.client);
    }
  }

  get current(): DeviceIo {
    return this.io;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    if (this.lan !== null && this.lan.push.state.kind === 'probing') {
      this.lan.push.start();
      return;
    }
    this.updateLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopLoop();
    const lan = this.lan;
    this.lan = null;
    if (lan !== null) {
      await lan.push.close();
      await lan.client.close();
    }
  }

  state(): TransportState {
    const push = this.lan?.push.state ?? null;
    const subscribed = this.io.transport === 'lan' && push?.kind === 'subscribed';
    return {
      transport: this.io.transport,
      reason: this.reason,
      updates: this.updatesOf(push),
      pushSource: subscribed && this.lan !== null ? this.lan.host : null,
      pushSince: push?.kind === 'subscribed' ? new Date(push.since).toISOString() : null,
    };
  }

  async useCloud(reason: string): Promise<void> {
    const lan = this.lan;
    this.lan = null;
    this.switchTo(this.context.openCloud(this.did), reason);
    if (lan !== null) {
      await lan.push.close();
      await lan.client.close();
    }
  }

  private updatesOf(push: PushState | null): string {
    const { lanPollMs, cloudPollMs, keepAliveMinMs, keepAliveMaxMs } = this.context.timing;
    if (!this.readable) {
      return 'none: the device has no readable MIoT properties';
    }
    if (this.io.transport === 'cloud') {
      return `cloud-poll every ${seconds(cloudPollMs)} s: ${CLOUD_HAS_NO_PUSH}`;
    }
    switch (push?.kind) {
      case 'subscribed':
        return `lan-push: the device sends changes and events itself (miIO.sub); a keep-alive probe every ${seconds(keepAliveMinMs)}-${seconds(keepAliveMaxMs)} s watches the subscription`;
      case 'probing':
        return 'starting: waiting for the device to answer the push probe';
      case 'unsupported':
      case 'lost':
        return `lan-poll every ${seconds(lanPollMs)} s: ${push.reason}`;
      case undefined:
        return `lan-poll every ${seconds(lanPollMs)} s: the LAN link has no push session`;
    }
  }

  private lanOf(host: string, client: MiioClient): Lan {
    const { log, timing, now, jitter, virtualDid } = this.context;
    const push = new LanPush(
      { did: this.did, host, client, virtualDid, timing, now, jitter, log },
      {
        subscribed: (): void => {
          void this.hooks.readAll();
        },
        uplink: this.hooks.uplink,
        changed: (): void => {
          this.updateLoop();
          this.hooks.changed();
        },
        lost: (reason): void => {
          void this.lanLost(reason);
        },
        returned: (): void => {
          this.lanReturned(host, client);
        },
      },
    );
    return { host, client, push };
  }

  private async lanLost(reason: string): Promise<void> {
    const lan = this.lan;
    if (lan === null) {
      return;
    }
    const host = await this.context.locate(this.did).catch((error: unknown) => {
      this.context.log.warn('xiaomi_device.locate_failed', {
        did: this.did,
        reason: String(error),
      });
      return null;
    });
    if (host !== null && host !== lan.host) {
      await this.moveLan(lan, host);
      return;
    }
    this.switchTo(
      this.context.openCloud(this.did),
      `${reason}; the hub uses the Xiaomi cloud until the device answers at ${lan.host} again`,
    );
  }

  private lanReturned(host: string, client: MiioClient): void {
    this.switchTo(lanIo(this.did, client), `the device answers on the LAN again at ${host}`);
  }

  private async moveLan(previous: Lan, host: string): Promise<void> {
    await previous.push.close();
    await previous.client.close();
    this.lan = null;
    try {
      const client = await this.context.openLan(this.did, host);
      this.lan = this.lanOf(host, client);
      this.switchTo(lanIo(this.did, client), `the device moved from ${previous.host} to ${host}`);
      if (this.running) {
        this.lan.push.start();
      }
    } catch (error) {
      this.switchTo(
        this.context.openCloud(this.did),
        `the device moved to ${host}, and the LAN handshake there failed: ${String(error)}`,
      );
    }
  }

  private switchTo(io: DeviceIo, reason: string): void {
    this.io = io;
    this.reason = reason;
    this.context.log.warn('xiaomi_device.transport_changed', {
      did: this.did,
      transport: io.transport,
      reason,
    });
    this.updateLoop();
    this.hooks.changed();
  }

  private polls(): boolean {
    if (!this.running || !this.readable) {
      return false;
    }
    const push = this.lan?.push.state.kind;
    return this.io.transport === 'cloud' || (push !== 'subscribed' && push !== 'probing');
  }

  private updateLoop(): void {
    if (!this.polls()) {
      this.stopLoop();
      return;
    }
    this.loop ??= startLoop(
      () =>
        this.io.transport === 'lan'
          ? this.context.timing.lanPollMs
          : this.context.timing.cloudPollMs,
      this.hooks.poll,
    );
  }

  private stopLoop(): void {
    this.loop?.stop();
    this.loop = null;
  }
}
