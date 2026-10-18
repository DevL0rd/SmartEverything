import { DISCORD_LISTENING_KEY } from '@smarteverything/domain';
import type { DiscordVoice } from '../computers/computer-ears';
import type { BareSource } from './listening-rows';
import type { ListeningRegistry } from './listening-registry';

const DISCORD_ROW: BareSource = {
  key: DISCORD_LISTENING_KEY,
  kind: 'discord',
  name: 'Discord',
  profileId: null,
  wake: true,
  transcribe: true,
  state: 'listening',
  writing: { state: 'on' },
  sensitivity: null,
  changeable: false,
};

export function mirrorDiscordCall(
  listening: Pick<ListeningRegistry, 'setExternal' | 'clearExternal'>,
  discord: DiscordVoice,
): () => void {
  return discord.changes(() => {
    if (discord.inVoice()) {
      listening.setExternal(DISCORD_ROW);
    } else {
      listening.clearExternal(DISCORD_LISTENING_KEY);
    }
  });
}
