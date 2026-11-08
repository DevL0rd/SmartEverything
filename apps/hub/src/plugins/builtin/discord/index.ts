import { fileURLToPath } from 'node:url';
import { Logger } from '@smarteverything/logging';
import { ChildHost } from '../../isolation/child-host';
import { forkChild } from '../../isolation/spawn';
import { pluginLogger, pluginSource } from '../../plugin-logs';
import { connectDiscord } from './discord-link';
import { IsolatedVoice } from './voice/isolated/isolated-voice';
import { downloader } from './media-download';
import { createDiscordPlugin } from './plugin';

const VOICE_WORKER = fileURLToPath(new URL('./voice-worker.mjs', import.meta.url));
const VOICE_SCOPE = 'hub.discord-voice';
const VOICE_LOG = pluginLogger(new Logger(VOICE_SCOPE), 'discord');

export const discordPlugin = createDiscordPlugin({
  connect: connectDiscord,
  download: downloader(),
  voice: () =>
    new IsolatedVoice(
      new ChildHost({
        kind: 'voice',
        spawn: forkChild({
          kind: 'voice',
          entry: VOICE_WORKER,
          output: { source: pluginSource('discord'), scope: VOICE_SCOPE, event: 'service.output' },
        }),
        log: VOICE_LOG,
      }),
      VOICE_LOG,
    ),
});
