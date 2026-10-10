import { fileURLToPath } from 'node:url';
import { ChildHost } from '../../isolation/child-host';
import { forkChild } from '../../isolation/spawn';
import { connectDiscord } from './discord-link';
import { IsolatedVoice } from './voice/isolated/isolated-voice';
import { downloader } from './media-download';
import { createDiscordPlugin } from './plugin';

const VOICE_WORKER = fileURLToPath(new URL('./voice-worker.mjs', import.meta.url));

export const discordPlugin = createDiscordPlugin({
  connect: connectDiscord,
  download: downloader(),
  voice: () =>
    new IsolatedVoice(
      new ChildHost({ kind: 'voice', spawn: forkChild({ kind: 'voice', entry: VOICE_WORKER }) }),
    ),
});
