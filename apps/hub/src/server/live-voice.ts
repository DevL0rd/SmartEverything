import type { ClientRow, LiveMessage, VoiceActivityNotice } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { VoiceWatcher } from '../listening/voice-activity';

export interface VoiceLevelSource {
  watch(watcher: VoiceWatcher, callId: string | null): boolean;
  active(watcher: VoiceWatcher): VoiceActivityNotice[];
  release(key: string): void;
}

export interface VoiceConnection {
  readonly id: number;
  readonly client: ClientRow;
}

export interface LiveVoiceOptions<Connection extends VoiceConnection> {
  readonly send: (connection: Connection, message: LiveMessage) => void;
  readonly profileOf: (clientId: string) => Promise<string>;
  readonly log: Logger;
}

export class LiveVoice<Connection extends VoiceConnection> {
  private source: VoiceLevelSource | null = null;

  constructor(private readonly options: LiveVoiceOptions<Connection>) {}

  attach(source: VoiceLevelSource): void {
    this.source = source;
  }

  async watch(connection: Connection, callId: string | null): Promise<boolean> {
    const allowed = this.source?.watch(await this.#watcherOf(connection), callId) ?? false;
    if (!allowed) {
      this.options.log.warn('voice_watch.refused', {
        callId,
        connectionId: connection.id,
        clientId: connection.client.id,
      });
    }
    return allowed;
  }

  async snapshot(connection: Connection): Promise<void> {
    const calls = this.source?.active(await this.#watcherOf(connection)) ?? [];
    this.options.send(connection, { type: 'voice_calls', calls });
  }

  async #watcherOf(connection: Connection): Promise<VoiceWatcher> {
    return {
      key: String(connection.id),
      owner: connection.client.role === 'owner',
      profileId: await this.options.profileOf(connection.client.id),
      send: (notice): void => {
        this.options.send(connection, notice);
      },
    };
  }

  close(connection: Connection): void {
    this.source?.release(String(connection.id));
  }
}
