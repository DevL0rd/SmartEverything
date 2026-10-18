import { DISCORD_STREAM, type DiscordStatus, type JsonValue } from '@smarteverything/domain';
import type { LinkState } from './link';

export class Status {
  private state: LinkState | 'offline' = 'offline';
  private detail: string | null = null;
  private botName: string | null = null;
  private botId: string | null = null;
  private serverCount = 0;
  private callList: DiscordStatus['calls'] = [];
  private notice: string | null = null;

  constructor(
    private readonly publish: (stream: string, value: JsonValue) => void,
    private readonly now: () => Date,
  ) {}

  view(): DiscordStatus {
    return {
      gateway: this.state,
      detail: this.detail,
      botName: this.botName,
      botId: this.botId,
      serverCount: this.serverCount,
      droppedMessages: 0,
      calls: this.callList,
      voiceNotice: this.notice,
      updatedAt: this.now().toISOString(),
    };
  }

  link(state: LinkState | 'offline', detail: string | null): void {
    this.state = state;
    this.detail = detail;
    this.announce();
  }

  identified(botId: string, botName: string | null): void {
    this.botId = botId;
    this.botName = botName;
    this.announce();
  }

  guilds(count: number): void {
    this.serverCount = count;
    this.announce();
  }

  calls(list: DiscordStatus['calls']): void {
    this.callList = list;
    this.announce();
  }

  voiceNotice(text: string | null): void {
    this.notice = text;
    this.announce();
  }

  announce(): void {
    this.publish(DISCORD_STREAM, { ...this.view() });
  }
}
