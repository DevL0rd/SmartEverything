import { DiscordInputError } from './errors';

export class Identity {
  botId = '';
  applicationId = '';

  assertReady(): void {
    if (this.botId === '') {
      throw new DiscordInputError('Discord is not connected yet; try again in a moment');
    }
  }
}
