import type { VoiceState } from './link';

export interface Moved {
  readonly guildId: string;
  readonly userId: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface Seat {
  readonly guildId: string;
  readonly userId: string;
  readonly channelId: string;
}

export class Occupancy {
  private readonly seats = new Map<string, Map<string, string>>();
  private readonly muted = new Map<string, boolean>();

  constructor(private readonly selfId: () => string) {}

  load(guildId: string, states: readonly { user_id: string; channel_id: string | null }[]): void {
    const seated = new Map<string, string>();
    for (const state of states) {
      if (state.channel_id !== null) {
        seated.set(state.user_id, state.channel_id);
      }
    }
    this.seats.set(guildId, seated);
  }

  forget(guildId: string): void {
    this.seats.delete(guildId);
    this.muted.delete(guildId);
  }

  update(state: VoiceState): Moved | null {
    const { guild_id: guildId } = state;
    if (guildId === undefined) {
      return null;
    }
    const seated = this.seats.get(guildId) ?? new Map<string, string>();
    this.seats.set(guildId, seated);
    const before = seated.get(state.user_id) ?? null;
    if (state.channel_id === null) {
      seated.delete(state.user_id);
    } else {
      seated.set(state.user_id, state.channel_id);
    }
    if (state.user_id === this.selfId()) {
      this.muted.set(guildId, state.mute);
    }
    return { guildId, userId: state.user_id, before, after: state.channel_id };
  }

  occupants(guildId: string, channelId: string): string[] {
    return [...(this.seats.get(guildId) ?? [])]
      .filter(([userId, seat]) => seat === channelId && userId !== this.selfId())
      .map(([userId]) => userId);
  }

  channelOf(guildId: string, userId: string): string | null {
    return this.seats.get(guildId)?.get(userId) ?? null;
  }

  serverMuted(guildId: string): boolean {
    return this.muted.get(guildId) === true;
  }

  seatsIn(guildId: string): Seat[] {
    return [...(this.seats.get(guildId) ?? [])]
      .filter(([userId]) => userId !== this.selfId())
      .map(([userId, channelId]) => ({ guildId, userId, channelId }));
  }
}
