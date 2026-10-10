import process from 'node:process';
import { serveChild, type ChildChannel } from '../../../../isolation/child-serve';
import {
  VOICE_STATE_PAYLOAD,
  type WorkerVoiceConnect,
  type VoiceGateway,
  type VoiceLink,
  type VoiceSignals,
} from '../link';
import {
  CONNECT_CALL,
  CONNECT_INPUT,
  COMMAND,
  type ParsedCommand,
  type VoiceEvent,
} from './protocol';

type LinkCommand = Extract<ParsedCommand, { name: 'play' | 'stop' | 'mute' | 'destroy' }>;

type Emit = (event: VoiceEvent) => void;

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The voice link closed';
}

class RelayGateway implements VoiceGateway {
  private readonly watching = new Map<string, VoiceSignals>();

  constructor(private readonly emit: Emit) {}

  send(guildId: string, payload: unknown): boolean {
    const parsed = VOICE_STATE_PAYLOAD.safeParse(payload);
    if (!parsed.success) {
      return false;
    }
    this.emit({ name: 'gatewaySend', payload: { guildId, payload: parsed.data } });
    return true;
  }

  watch(guildId: string, signals: VoiceSignals): () => void {
    this.watching.set(guildId, signals);
    return (): void => {
      if (this.watching.get(guildId) === signals) {
        this.watching.delete(guildId);
      }
    };
  }

  signals(guildId: string): VoiceSignals | undefined {
    return this.watching.get(guildId);
  }
}

class Links {
  private readonly open = new Map<string, VoiceLink>();

  constructor(
    private readonly emit: Emit,
    private readonly gateway: RelayGateway,
    private readonly connect: WorkerVoiceConnect,
  ) {}

  async join(raw: unknown): Promise<null> {
    const { linkId, guildId, channelId, muted } = CONNECT_INPUT.parse(raw);
    const link = await this.connect({
      guildId,
      channelId,
      muted,
      gateway: this.gateway,
      trouble: (trouble) => {
        this.emit({ name: 'dave', payload: { linkId, trouble } });
      },
    });
    this.open.set(linkId, link);
    link.onSpeaking((userId) => {
      this.emit({ name: 'speaking', payload: { linkId, userId } });
    });
    link.onClosed((reason, cause) => {
      this.open.delete(linkId);
      this.emit({
        name: 'closed',
        payload: {
          linkId,
          reason,
          cause: cause === null ? null : describe(cause),
        },
      });
    });
    return null;
  }

  run(command: ParsedCommand): void {
    switch (command.name) {
      case 'server':
        this.gateway.signals(command.payload.guildId)?.server(command.payload.data);
        return;
      case 'state':
        this.gateway.signals(command.payload.guildId)?.state(command.payload.data);
        return;
      case 'listen':
        this.listen(command.payload).catch((cause: unknown) => {
          process.stderr.write(`voice worker listen failed: ${describe(cause)}\n`);
        });
        return;
      case 'play':
      case 'stop':
      case 'mute':
      case 'destroy':
        this.control(command);
    }
  }

  private control(command: LinkCommand): void {
    switch (command.name) {
      case 'play':
        this.open.get(command.payload.linkId)?.play(command.payload.packet);
        return;
      case 'stop':
        this.open.get(command.payload.linkId)?.stop();
        return;
      case 'mute':
        this.open.get(command.payload.linkId)?.setMuted(command.payload.muted);
        return;
      case 'destroy':
        this.open.get(command.payload.linkId)?.destroy();
        this.open.delete(command.payload.linkId);
    }
  }

  private async listen(request: {
    readonly linkId: string;
    readonly streamId: number;
    readonly userId: string;
    readonly silenceMs: number;
  }): Promise<void> {
    const { linkId, streamId, userId, silenceMs } = request;
    const link = this.open.get(linkId);
    try {
      for await (const packet of link?.listen(userId, silenceMs) ?? []) {
        this.emit({ name: 'audio', payload: { linkId, streamId, packet } });
      }
    } finally {
      this.emit({ name: 'audioEnd', payload: { linkId, streamId } });
    }
  }
}

export function serveVoice(connect: WorkerVoiceConnect): ChildChannel {
  const out: { channel: ChildChannel | null } = { channel: null };
  const emit: Emit = (event) => {
    out.channel?.emit(event.name, event.payload);
  };
  const links = new Links(emit, new RelayGateway(emit), connect);
  const channel = serveChild({
    call: async (name, payload): Promise<unknown> => {
      if (name !== CONNECT_CALL) {
        throw new Error(`Unknown call ${name}`);
      }
      return links.join(payload);
    },
    event: (name, payload) => {
      const command = COMMAND.safeParse({ name, payload });
      if (command.success) {
        links.run(command.data);
      } else {
        process.stderr.write(`voice worker ignored an invalid ${name} command\n`);
      }
    },
  });
  out.channel = channel;
  return channel;
}
