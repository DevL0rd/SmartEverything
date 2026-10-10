import {
  VOICE_STATE_PAYLOAD,
  type VoiceGateway,
  type VoiceServer,
  type VoiceSignals,
  type VoiceState,
  type VoiceStatePayload,
} from './link';

export interface GatewayVoiceDeps {
  readonly send: (guildId: string, payload: VoiceStatePayload) => Promise<void>;
  readonly report: (cause: unknown) => void;
}

export class GatewayVoice implements VoiceGateway {
  private readonly watching = new Map<string, VoiceSignals>();

  constructor(private readonly deps: GatewayVoiceDeps) {}

  send(guildId: string, payload: unknown): boolean {
    const parsed = VOICE_STATE_PAYLOAD.safeParse(payload);
    if (!parsed.success) {
      this.deps.report(parsed.error);
      return false;
    }
    this.deps.send(guildId, parsed.data).catch(this.deps.report);
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

  server(data: VoiceServer): void {
    this.watching.get(data.guild_id)?.server(data);
  }

  ownState(data: VoiceState): void {
    if (data.guild_id !== undefined) {
      this.watching.get(data.guild_id)?.state(data);
    }
  }
}
