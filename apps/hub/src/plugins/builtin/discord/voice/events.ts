import { GUILD_VOICE_STATES, VOICE_SERVER, VOICE_STATE } from './link';
import type { GatewayVoice } from './gateway-voice';
import type { Occupancy } from './occupancy';
import type { Roster } from './roster';
import type { VoiceService } from './service';

export interface VoiceEventsDeps {
  readonly occupancy: Occupancy;
  readonly gateway: GatewayVoice;
  readonly roster: Roster;
  readonly service: VoiceService;
  readonly selfId: () => string;
  readonly report: (cause: unknown) => void;
}

export class VoiceEvents {
  constructor(private readonly deps: VoiceEventsDeps) {}

  guildCreated(raw: unknown): void {
    const guild = GUILD_VOICE_STATES.parse(raw);
    this.deps.occupancy.load(guild.id, guild.voice_states);
    this.deps.service.guildLoaded(guild.id).catch(this.deps.report);
  }

  guildGone(guildId: string): void {
    this.deps.occupancy.forget(guildId);
    this.deps.service.leave(guildId).catch(this.deps.report);
  }

  stateUpdated(raw: unknown): void {
    const state = VOICE_STATE.parse(raw);
    const { roster, occupancy, gateway, selfId, service } = this.deps;
    roster.learn(state);
    const moved = occupancy.update(state);
    if (state.user_id === selfId()) {
      gateway.ownState(state);
    }
    if (moved !== null) {
      service.stateChanged(moved).catch(this.deps.report);
    }
  }

  serverUpdated(raw: unknown): void {
    this.deps.gateway.server(VOICE_SERVER.parse(raw));
  }
}
