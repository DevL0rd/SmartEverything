import { DiscordInputError } from '../errors';
import type { CommandReply, CommandSet } from '../commands';
import type { VoiceService } from './service';

const EVERYWHERE = { contexts: [0, 1], integration_types: [0] } as const;

function define(name: string, description: string): CommandSet['definition'] {
  return { name, description, ...EVERYWHERE };
}

function guildOf(guildId: string | null): string {
  if (guildId === null) {
    throw new DiscordInputError('Voice calls are only in servers.');
  }
  return guildId;
}

async function join(
  voice: VoiceService,
  guildId: string | null,
  actorId: string,
): Promise<CommandReply> {
  const guild = guildOf(guildId);
  const channelId = voice.channelOf(guild, actorId);
  if (channelId === null) {
    throw new DiscordInputError('Join a voice channel in this server first, then use /join.');
  }
  const call = await voice.join(guild, channelId);
  return {
    title: 'Joined the call',
    tone: 'good',
    lines: [`Transcribing <#${call.channelId}>. Use /leave to stop.`],
  };
}

async function leave(voice: VoiceService, guildId: string | null): Promise<CommandReply> {
  return (await voice.leave(guildOf(guildId)))
    ? { title: 'Left the call', tone: 'good', lines: ['The transcript was saved.'] }
    : {
        title: 'Not in a call',
        tone: 'info',
        lines: ['The bot is not in a voice call in this server.'],
      };
}

function mute(voice: VoiceService, guildId: string | null, muted: boolean): CommandReply {
  voice.mute(guildOf(guildId), muted);
  return {
    title: muted ? 'Muted' : 'Unmuted',
    tone: 'good',
    lines: [
      muted
        ? 'It stays in the call and keeps typing in the call chat, without making any audio.'
        : 'It will talk in the call again.',
    ],
  };
}

export function voiceCommands(voice: VoiceService): readonly CommandSet[] {
  return [
    {
      name: 'join',
      definition: define('join', 'Join your voice call and transcribe it'),
      run: ({ guildId, actorId }) => join(voice, guildId, actorId),
    },
    {
      name: 'leave',
      definition: define('leave', 'Leave the voice call in this server'),
      run: ({ guildId }) => leave(voice, guildId),
    },
    {
      name: 'mute',
      definition: define(
        'mute',
        'Stop the bot talking in the call; it keeps typing in the call chat',
      ),
      run: ({ guildId }) => Promise.resolve(mute(voice, guildId, true)),
    },
    {
      name: 'unmute',
      definition: define('unmute', 'Let the bot talk in the call again'),
      run: ({ guildId }) => Promise.resolve(mute(voice, guildId, false)),
    },
  ];
}
