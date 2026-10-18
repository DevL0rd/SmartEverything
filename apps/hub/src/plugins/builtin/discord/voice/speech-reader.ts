import { z } from 'zod';
import { SNOWFLAKE } from '../ids';
import {
  ApiError,
  pluginToolName,
  PLUGIN_ID,
  type TranscriptSession,
} from '@smarteverything/domain';
import type { ToolCaller } from '../../../../ai-tools/hub-tool';
import type { PluginSpeechReader } from '../../../../store/repositories/speech';
import type { PluginTranscripts } from '../../../plugin-transcripts';
import type { DiscordServices } from '../services';
import { summaryOf } from './calls';

const RECENT_CALLS = 200;
const SOURCE_KEY = z.tuple([SNOWFLAKE, SNOWFLAKE]);
function sourceKey(session: TranscriptSession): string {
  const summary = summaryOf(session);
  if (summary === null) throw new ApiError('forbidden', 'The Discord call is unavailable.');
  return JSON.stringify([summary.guildId, summary.channelId]);
}
function validateKey(services: DiscordServices, sourceId: string): void {
  const [guildId, channelId] = SOURCE_KEY.parse(JSON.parse(sourceId));
  services.policy.assertGuild(guildId);
  services.policy.assertChannel(channelId);
}

function validateCaller(services: DiscordServices, caller: ToolCaller): void {
  services.authority.assertOwner(caller);
  if (
    caller.pluginRequester === undefined
      ? caller.pluginId !== undefined
      : caller.pluginRequester !== 'owner'
  )
    throw new ApiError('forbidden', 'Only the admitted owner may use Discord speech triggers.');
}

function validateSession(
  services: DiscordServices,
  session: TranscriptSession,
  sourceId?: string,
): void {
  const summary = summaryOf(session);
  if (summary === null || (sourceId !== undefined && sourceId !== sourceKey(session)))
    throw new ApiError('forbidden', 'This Discord call is outside the selected speech source.');
  services.policy.assertGuild(summary.guildId);
  services.policy.assertChannel(summary.channelId);
}

export function discordSpeechReader(
  services: DiscordServices,
  transcripts: PluginTranscripts,
): PluginSpeechReader {
  return {
    readTool: () => ({
      name: pluginToolName(PLUGIN_ID.parse('discord'), 'voice'),
      args: { action: 'calls' },
    }),
    admit: (caller, sourceId): void => {
      validateCaller(services, caller);
      if (sourceId !== undefined) admitSelected(services, transcripts, sourceId);
    },
    validate: (caller, session, sourceId): void => {
      validateCaller(services, caller);
      if (session !== undefined) validateSession(services, session, sourceId);
      else if (sourceId !== undefined) validateKey(services, sourceId);
    },
    sources: (caller): ReturnType<PluginSpeechReader['sources']> => {
      validateCaller(services, caller);
      const seen = new Set<string>();
      return transcripts.list(RECENT_CALLS).flatMap((session) => {
        const summary = summaryOf(session);
        if (
          summary === null ||
          seen.has(summary.channelId) ||
          !services.policy.guildAllowed(summary.guildId) ||
          !services.policy.channelAllowed(summary.channelId)
        )
          return [];
        seen.add(summary.channelId);
        return [
          {
            source: { kind: 'plugin' as const, pluginId: 'discord', sourceId: sourceKey(session) },
            label: summary.channelName ?? 'Discord voice channel',
          },
        ];
      });
    },
  };
}

function admitSelected(
  services: DiscordServices,
  transcripts: PluginTranscripts,
  sourceId: string,
): void {
  validateKey(services, sourceId);
  const session = transcripts
    .list(RECENT_CALLS)
    .find((item) => summaryOf(item) !== null && sourceKey(item) === sourceId);
  if (session === undefined)
    throw new ApiError('not_found', 'The selected Discord speech source is unavailable.');
  validateSession(services, session, sourceId);
}
