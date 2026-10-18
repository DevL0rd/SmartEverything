import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from '@discordjs/voice';
import { DaveGuard } from './dave';
import {
  VoiceConnectError,
  type VoiceClosing,
  type VoiceGateway,
  type VoiceLink,
  type WorkerVoiceConnect,
} from './link';
import { background } from '@smarteverything/logging';

const READY_MS = 20_000;
const RECOVER_MS = 5000;
const DECRYPTION_FAILURE_TOLERANCE = 24;
const DAVE_READY_MS = 5000;

function adapterOf(guildId: string, gateway: VoiceGateway): DiscordGatewayAdapterCreator {
  return (methods) => {
    const stop = gateway.watch(guildId, {
      server: (data) => {
        methods.onVoiceServerUpdate(data);
      },
      state: ({ member: _member, guild_id: owner, ...data }) => {
        methods.onVoiceStateUpdate(owner === undefined ? data : { ...data, guild_id: owner });
      },
    });
    return {
      sendPayload: (payload) => gateway.send(guildId, payload),
      destroy: stop,
    };
  };
}

class Output {
  private frames: PassThrough | null = null;

  constructor(
    private readonly player: AudioPlayer,
    private readonly guard: DaveGuard,
  ) {
    player.on('stateChange', (_before, after) => {
      if (after.status === AudioPlayerStatus.Idle) {
        this.release();
      }
    });
    player.on('error', () => undefined);
  }

  push(packet: Uint8Array): void {
    if (!this.guard.ready()) {
      this.guard.notReady();
      return;
    }
    this.open().write(Buffer.from(packet.buffer, packet.byteOffset, packet.byteLength));
  }

  stop(): void {
    this.player.stop(true);
    this.release();
  }

  private open(): PassThrough {
    if (this.frames !== null) {
      return this.frames;
    }
    const frames = new PassThrough({ objectMode: true });
    this.frames = frames;
    this.player.play(createAudioResource(frames, { inputType: StreamType.Opus }));
    return frames;
  }

  private release(): void {
    this.frames?.destroy();
    this.frames = null;
  }
}

interface LinkParts {
  readonly connection: VoiceConnection;
  readonly guard: DaveGuard;
  readonly player: AudioPlayer;
  readonly channelId: string;
  readonly muted: boolean;
}

class DiscordVoiceLink implements VoiceLink {
  private readonly closedListeners: ((reason: VoiceClosing, cause: unknown) => void)[] = [];
  private closed = false;
  private selfMuted: boolean;
  private readonly output: Output;

  private readonly connection: VoiceConnection;
  private readonly guard: DaveGuard;
  readonly channelId: string;

  constructor(parts: LinkParts) {
    const { connection, guard, player, channelId, muted } = parts;
    this.connection = connection;
    this.guard = guard;
    this.channelId = channelId;
    this.selfMuted = muted;
    this.output = new Output(player, guard);
    connection.on('stateChange', (_before, after) => {
      if (after.status === VoiceConnectionStatus.Destroyed) {
        this.close('closed');
      }
      if (after.status === VoiceConnectionStatus.Disconnected) {
        background(this.recover(), 'discord_voice.recover_failed');
      }
    });
    connection.on('error', () => undefined);
  }

  giveUp(reason: VoiceClosing, cause: unknown): void {
    this.close(reason, cause);
  }

  muted = (): boolean => this.selfMuted;

  setMuted(muted: boolean): boolean {
    const rejoined = this.connection.rejoin({ ...this.connection.joinConfig, selfMute: muted });
    if (rejoined) {
      this.selfMuted = muted;
    }
    return rejoined;
  }

  onSpeaking(listener: (userId: string) => void): void {
    this.connection.receiver.speaking.on('start', listener);
  }

  listen(userId: string, silenceMs: number): AsyncIterable<Uint8Array> {
    return this.guard.listen(this.connection.receiver, userId, silenceMs);
  }

  play(packet: Uint8Array): void {
    this.output.push(packet);
  }

  stop(): void {
    this.output.stop();
  }

  onClosed(listener: (reason: VoiceClosing, cause: unknown) => void): void {
    this.closedListeners.push(listener);
  }

  destroy(): void {
    this.output.stop();
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
  }

  private async recover(): Promise<void> {
    try {
      await Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, RECOVER_MS),
        entersState(this.connection, VoiceConnectionStatus.Connecting, RECOVER_MS),
      ]);
    } catch (cause) {
      this.close('closed', cause);
    }
  }

  private close(reason: VoiceClosing, cause: unknown = null): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.destroy();
    this.closedListeners.forEach((listener) => {
      listener(reason, cause);
    });
  }
}

export const connectDiscordVoice: WorkerVoiceConnect = async (request) => {
  const { guildId, channelId, muted, gateway, trouble } = request;
  const connection = joinVoiceChannel({
    guildId,
    channelId,
    adapterCreator: adapterOf(guildId, gateway),
    selfDeaf: false,
    selfMute: muted,
    daveEncryption: true,
    decryptionFailureTolerance: DECRYPTION_FAILURE_TOLERANCE,
    debug: true,
  });
  const link: { current: DiscordVoiceLink | null } = { current: null };
  const guard = new DaveGuard(connection, {
    report: trouble,
    giveUp: (reason, cause): void => {
      link.current?.giveUp(reason, cause);
    },
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, READY_MS);
  } catch (cause) {
    connection.destroy();
    throw new VoiceConnectError(channelId, cause);
  }
  await guard.settled(DAVE_READY_MS);
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  connection.subscribe(player);
  const created = new DiscordVoiceLink({ connection, guard, player, channelId, muted });
  link.current = created;
  return created;
};
