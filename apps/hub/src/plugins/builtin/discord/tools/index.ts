import { READ_HINTS, WRITE_HINTS } from '../../tool-kit';
import type { PluginTool } from '../../contract';
import { operationsOf } from '../operations';
import type { DiscordServices } from '../services';
import type { Status } from '../status';
import { actionTool } from './action-tool';
import { localActions } from './local-actions';
import { authorizeContextAction } from './owner-actions';
import { promptTool } from './prompt-tool';
import { contextTool, mediaTool } from './reading-tools';
import { replyTool, type ReplyHooks } from './reply-tool';
import { sendTool } from './send-tool';
import { uploadTool } from './upload-tool';
import { voiceActions, type VoiceTools } from '../voice/tools';

const ACT_IN =
  'When answering a Discord request, pass its eventId to reply in that conversation; otherwise name the channel.';

export function discordTools(
  services: DiscordServices,
  status: Status,
  hooks: ReplyHooks,
  voice: VoiceTools,
): PluginTool[] {
  return [
    sendTool(services),
    promptTool(services),
    actionTool(services, {
      name: 'read',
      title: 'Read Discord servers, channels, messages and people',
      intro: `Read from Discord. ${ACT_IN}`,
      annotations: READ_HINTS,
      operations: operationsOf('read'),
      local: localActions(services, status),
    }),
    actionTool(services, {
      name: 'change',
      title: 'Change things in Discord',
      intro: `Post, edit, create and configure things in Discord: messages, reactions, polls, threads, channels, roles, invites, events, emoji and rules. Everything stays inside the servers and channels the settings allow. ${ACT_IN}`,
      annotations: WRITE_HINTS,
      operations: operationsOf('change'),
      local: [authorizeContextAction(services)],
    }),
    actionTool(services, {
      name: 'remove',
      title: 'Delete or restrict in Discord',
      intro: `Delete messages, channels, roles, invites and rules, and kick, ban, time out or unban people. These run as soon as they are called, so make sure the person asked for exactly this. ${ACT_IN}`,
      annotations: WRITE_HINTS,
      operations: operationsOf('remove'),
      local: [],
    }),
    actionTool(services, {
      name: 'voice',
      title: 'Discord voice calls',
      intro: `Join, leave and talk in voice calls, and read their transcripts. ${ACT_IN}`,
      annotations: WRITE_HINTS,
      operations: [],
      local: voiceActions(services, voice),
    }),
    contextTool(services),
    mediaTool(services),
    uploadTool(services),
    replyTool(services, hooks),
  ];
}
