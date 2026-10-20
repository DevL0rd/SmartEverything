import {
  CommandRefusedError,
  type AdapterSink,
  type CapabilityKey,
  type StateUpdate,
} from '@smarteverything/domain';
import {
  keyMessage,
  launchActionOf,
  launchMessage,
  magicPacket,
  powerOffSteps,
  remoteUrl,
  tvDevice,
  type TvAction,
  type TvIdentity,
} from '@smarteverything/smartthings';
import { failureLine } from '@smarteverything/logging';
import { WAKE_BOOT_MS, WAKE_RESENDS_MS } from '../../network/wake-budget';
import type { RunContext } from '../contract';
import { ArtModeChannel } from './art-mode';
import { TvConnection, TvConnectionError, TvRefusedError } from './connection';
import type { SamsungTvIo } from './io';
import { readTvInfo, REMOTE_APP_NAME, type TvAccount } from './link';
import { PowerStatePolling } from './power-polling';
import { ReusedConnection } from './reused-connection';

const CONNECT_TIMEOUT_MS = 10_000;

const WAKE_CHECK_MS = 1000;

const APPS_TIMEOUT_MS = 5000;

export class TvDidNotWakeError extends Error {
  override readonly name = 'TvDidNotWakeError';

  constructor(readonly host: string) {
    super(
      `The Samsung TV at ${host} did not turn on within ${String(WAKE_BOOT_MS)} ms of the Wake-on-LAN packets; on the screen turn on Power On with Mobile (Settings, General, Network, Expert Settings) and keep it on the same network as the hub.`,
    );
  }
}

const ART_MODE: CapabilityKey = 'art_mode';

export type SaveTelevision = (account: TvAccount) => Promise<void>;

export class TvController {
  private readonly remote = new ReusedConnection(() => this.open());
  private readonly art: ArtModeChannel | null;
  private sink: AdapterSink | null = null;
  readonly polling: PowerStatePolling;

  constructor(
    private account: TvAccount,
    private readonly io: SamsungTvIo,
    private readonly context: RunContext,
    private readonly save: SaveTelevision,
  ) {
    this.polling = new PowerStatePolling(
      () => this.probe(),
      (on) => {
        this.powerChanged(on);
      },
      context.log,
      () => io.clock.now().getTime(),
    );
    this.art = account.frame && !this.attached ? this.artChannel() : null;
  }

  get attached(): boolean {
    return this.account.attachedTo !== undefined;
  }

  get frame(): boolean {
    return this.account.frame;
  }

  get host(): string {
    return this.account.host;
  }

  get macAddress(): string {
    return this.account.macAddress;
  }

  get externalId(): string {
    return tvDevice(this.identity(), true).externalId;
  }

  answers(externalId: string): boolean {
    return externalId === this.externalId || externalId === this.account.attachedTo;
  }

  identity(): TvIdentity {
    const { host, macAddress, name, model, frame } = this.account;
    return { host, macAddress, name, model, frame };
  }

  attach(sink: AdapterSink | null): void {
    this.sink = sink;
  }

  update(capability: CapabilityKey, on: boolean): StateUpdate {
    return {
      externalId: this.externalId,
      capability,
      value: on,
      observedAt: this.io.clock.now().toISOString(),
    };
  }

  async refresh(): Promise<readonly StateUpdate[]> {
    if (this.attached) {
      return [];
    }
    const on = await this.polling.checkNow();
    const power = this.update('power', on);
    if (this.art === null) {
      return [power];
    }
    return [power, this.update(ART_MODE, on && (await this.art.status()))];
  }

  async perform(action: TvAction): Promise<void> {
    switch (action.kind) {
      case 'power':
        await (action.on ? this.powerOn() : this.powerOff());
        return;
      case 'key':
        await this.sendWhileOn('remote_key', keyMessage(action.key, 'Click'));
        return;
      case 'launch':
        await this.launch(action.app.name, action.app.ids);
        return;
      case 'art_mode':
        await this.setArtMode(action.on);
        return;
    }
  }

  async moveTo(host: string): Promise<void> {
    const from = this.account.host;
    this.close();
    this.account = { ...this.account, host };
    await this.save(this.account);
    this.context.log.info('television.address_changed', { from, host });
    if (!this.attached) {
      this.sink?.devices([tvDevice(this.identity(), true)]);
    }
    await this.polling.checkNow();
  }

  close(): void {
    this.remote.close();
    this.art?.close();
  }

  private artChannel(): ArtModeChannel {
    return new ArtModeChannel({
      host: () => this.account.host,
      io: this.io,
      log: this.context.log,
      token: () => this.account.token,
      onArtMode: (on): void => {
        this.sink?.state(this.update(ART_MODE, on));
      },
      onToken: (token) => this.rememberToken(token),
    });
  }

  private async probe(): Promise<boolean> {
    try {
      return (await readTvInfo(this.io, this.account.host)).on;
    } catch (cause) {
      if (cause instanceof TvConnectionError) {
        return false;
      }
      throw cause;
    }
  }

  private powerChanged(on: boolean): void {
    if (!this.attached) {
      this.sink?.state(this.update('power', on));
    }
    if (!on) {
      this.close();
      if (this.art !== null) {
        this.sink?.state(this.update(ART_MODE, false));
      }
      return;
    }
    this.remote.get().catch((cause: unknown) => {
      this.warn('remote.connect_failed', cause);
    });
    this.art?.status().catch((cause: unknown) => {
      this.warn('art.status_failed', cause);
    });
  }

  private warn(event: string, cause: unknown): void {
    this.context.log.warn(event, { host: this.account.host, reason: failureLine(cause) });
  }

  private async open(): Promise<TvConnection> {
    const { host } = this.account;
    const socket = this.io.openSocket(
      remoteUrl(host, 'remote', REMOTE_APP_NAME, this.account.token),
    );
    let connection: TvConnection;
    try {
      connection = await TvConnection.open(socket, host, CONNECT_TIMEOUT_MS, 'connected');
    } catch (cause) {
      if (cause instanceof TvRefusedError) {
        await this.context.needsAttention(cause);
      }
      throw cause;
    }
    connection.onProblem((problem) => {
      this.context.log.warn('remote.problem', { host, reason: problem.message });
    });
    await this.rememberToken(connection.token);
    return connection;
  }

  private async rememberToken(token: string | null): Promise<void> {
    if (token === null || token === this.account.token) {
      return;
    }
    this.account = { ...this.account, token };
    await this.save(this.account);
  }

  private sendWake(): Promise<void> {
    return this.io.sendMagicPacket(magicPacket(this.account.macAddress), this.account.host);
  }

  private async powerOn(): Promise<void> {
    if (await this.polling.current()) {
      return;
    }
    const resends = [...WAKE_RESENDS_MS];
    await this.sendWake();
    for (let waited = WAKE_CHECK_MS; waited <= WAKE_BOOT_MS; waited += WAKE_CHECK_MS) {
      await this.io.clock.sleep(WAKE_CHECK_MS);
      if (await this.polling.checkNow()) {
        return;
      }
      if (resends[0] !== undefined && waited >= resends[0]) {
        resends.shift();
        await this.sendWake();
      }
    }
    throw new TvDidNotWakeError(this.account.host);
  }

  private async powerOff(): Promise<void> {
    if (!(await this.polling.current())) {
      return;
    }
    const connection = await this.remote.get();
    for (const step of powerOffSteps(this.account.frame)) {
      await (step.kind === 'send' ? connection.send(step.message) : this.io.clock.sleep(step.ms));
    }
  }

  private async refuseWhileOff(capability: string): Promise<void> {
    if (!(await this.polling.current())) {
      throw new CommandRefusedError(capability, 'the television is off');
    }
  }

  private async setArtMode(on: boolean): Promise<void> {
    if (this.art === null) {
      throw new CommandRefusedError(ART_MODE, 'the television is not a Frame TV');
    }
    await this.refuseWhileOff(ART_MODE);
    await this.art.set(on);
  }

  private async sendWhileOn(capability: string, message: string): Promise<void> {
    await this.refuseWhileOff(capability);
    const connection = await this.remote.get();
    await connection.send(message);
  }

  private async launch(name: string, ids: readonly string[]): Promise<void> {
    await this.refuseWhileOff('app_launch');
    const connection = await this.remote.get();
    const installed = await connection.installedApps(APPS_TIMEOUT_MS);
    const app = ids.flatMap((id) => installed.filter((entry) => entry.appId === id))[0];
    if (app === undefined) {
      throw new CommandRefusedError('app_launch', `${name} is not installed on the television`);
    }
    await connection.send(launchMessage(app.appId, launchActionOf(app.appType)));
  }
}
