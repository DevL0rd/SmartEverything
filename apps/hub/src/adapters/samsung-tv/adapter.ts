import {
  CommandRefusedError,
  type AdapterSink,
  type CapabilityKey,
  type DeviceCommand,
  type JsonValue,
  type ProviderAdapter,
  type StateUpdate,
  type Unsubscribe,
} from '@smarteverything/domain';
import {
  keyMessage,
  launchActionOf,
  launchMessage,
  magicPacket,
  powerOffSteps,
  remoteUrl,
  resolveTvCommand,
  tvDevice,
  type TvAction,
  type TvIdentity,
} from '@smarteverything/smartthings';
import type { RunContext } from '../contract';
import { ArtModeChannel } from './art-mode';
import { TvConnection, TvConnectionError, TvRefusedError } from './connection';
import type { SamsungTvIo } from './io';
import { readTvInfo, REMOTE_APP_NAME, type TvAccount } from './link';
import { PowerStatePolling } from './power-polling';
import { ReusedConnection } from './reused-connection';

const CONNECT_TIMEOUT_MS = 10_000;

const WAKE_TIMEOUT_MS = 20_000;

const WAKE_CHECK_MS = 1000;

const APPS_TIMEOUT_MS = 5000;

export class TvDidNotWakeError extends Error {
  override readonly name = 'TvDidNotWakeError';

  constructor(readonly host: string) {
    super(
      `The Samsung TV at ${host} did not turn on within ${String(WAKE_TIMEOUT_MS)} ms of the Wake-on-LAN packet; check that network standby is on and the hub is on the same subnet.`,
    );
  }
}

const ART_MODE: CapabilityKey = 'art_mode';

class TvController {
  private readonly remote = new ReusedConnection(() => this.open());
  private readonly art: ArtModeChannel | null;
  private token: string;
  private sink: AdapterSink | null = null;
  readonly polling: PowerStatePolling;

  constructor(
    private readonly account: TvAccount,
    private readonly io: SamsungTvIo,
    private readonly context: RunContext,
  ) {
    this.token = account.token;
    this.polling = new PowerStatePolling(
      () => this.probe(),
      (on) => {
        this.powerChanged(on);
      },
      context.log,
    );
    this.art = account.frame ? this.artChannel() : null;
  }

  get frame(): boolean {
    return this.account.frame;
  }

  get externalId(): string {
    return tvDevice(this.identity(), true).externalId;
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

  close(): void {
    this.remote.close();
    this.art?.close();
  }

  private artChannel(): ArtModeChannel {
    return new ArtModeChannel({
      host: this.account.host,
      io: this.io,
      log: this.context.log,
      token: () => this.token,
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
    this.sink?.state(this.update('power', on));
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
    this.context.log.warn(event, { host: this.account.host, reason: String(cause) });
  }

  private async open(): Promise<TvConnection> {
    const { host } = this.account;
    const socket = this.io.openSocket(remoteUrl(host, 'remote', REMOTE_APP_NAME, this.token));
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
    if (token === null || token === this.token) {
      return;
    }
    this.token = token;
    await this.context.saveAccount({
      label: this.account.name,
      secrets: { ...this.account, token },
    });
  }

  private async powerOn(): Promise<void> {
    if (await this.polling.checkNow()) {
      return;
    }
    await this.io.sendMagicPacket(magicPacket(this.account.macAddress));
    for (let waited = 0; waited < WAKE_TIMEOUT_MS; waited += WAKE_CHECK_MS) {
      await this.io.clock.sleep(WAKE_CHECK_MS);
      if (await this.polling.checkNow()) {
        return;
      }
    }
    throw new TvDidNotWakeError(this.account.host);
  }

  private async powerOff(): Promise<void> {
    if (!(await this.polling.checkNow())) {
      return;
    }
    const connection = await this.remote.get();
    for (const step of powerOffSteps(this.account.frame)) {
      await (step.kind === 'send' ? connection.send(step.message) : this.io.clock.sleep(step.ms));
    }
  }

  private async refuseWhileOff(capability: string): Promise<void> {
    if (!(await this.polling.checkNow())) {
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

export function createSamsungTvAdapter(
  account: TvAccount,
  io: SamsungTvIo,
  context: RunContext,
): ProviderAdapter {
  const tv = new TvController(account, io, context);
  return {
    provider: 'samsung_tv',
    discover: () => Promise.resolve([tvDevice(tv.identity(), true)]),
    subscribe: (sink): Promise<Unsubscribe> => {
      tv.attach(sink);
      tv.polling.start();
      return Promise.resolve(() => {
        tv.polling.stop();
        tv.close();
        tv.attach(null);
        return Promise.resolve();
      });
    },
    execute: async (command: DeviceCommand): Promise<JsonValue> => {
      await tv.perform(resolveTvCommand(command.capability, command.value, tv.frame));
      return null;
    },
    refresh: (externalIds) =>
      externalIds.includes(tv.externalId) ? tv.refresh() : Promise.resolve([]),
  };
}
