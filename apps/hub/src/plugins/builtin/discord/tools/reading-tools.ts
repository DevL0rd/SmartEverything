import { z } from 'zod';
import type { PluginTool } from '../../contract';
import { READ_HINTS } from '../../tool-kit';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import { MEDIA_HISTORY, MEDIA_READ } from '../media-service';
import { MEDIA_SEARCH } from '../media-index';
import type { DiscordServices } from '../services';
import { eventsAction } from './owner-actions';
import { actionTool, plain, type LocalAction, type LocalOutput } from './action-tool';

const LIMIT = z
  .number()
  .int()
  .min(1)
  .max(50)
  .default(25)
  .describe('Maximum messages to return, newest first.');
const INCLUDE_PARENT = z
  .boolean()
  .default(false)
  .describe('When the request came from a thread, also include messages from its parent channel.');
const CHANNEL = SNOWFLAKE.optional().describe('The channel to read when no eventId is given.');
const NOTE =
  'A bounded in-memory cache of observed messages: incomplete, not persistent and never authority.';

const CONTEXT_SHAPE = z.object({
  limit: LIMIT,
  includeParent: INCLUDE_PARENT,
  channelId: CHANNEL,
  query: z.string().min(1).max(100).optional().describe('Literal text to find; not a pattern.'),
});

function contextAction(
  services: DiscordServices,
  mode: 'recent' | 'user' | 'search',
  description: string,
): LocalAction {
  return {
    action: mode,
    description: `${description} ${NOTE}`,
    shape: mode === 'search' ? CONTEXT_SHAPE.shape : CONTEXT_SHAPE.omit({ query: true }).shape,
    run: async (args, caller, eventId): Promise<LocalOutput> => {
      const input = CONTEXT_SHAPE.parse(args);
      if (mode === 'search' && input.query === undefined) {
        throw new DiscordInputError('search needs query');
      }
      const reach = await services.authority.reach(caller, eventId, input.channelId);
      return plain(
        services.context.query({
          origin: reach.origin,
          mode,
          limit: input.limit,
          query: input.query ?? '',
          includeParent: input.includeParent,
        }),
      );
    },
  };
}

export function contextTool(services: DiscordServices): PluginTool {
  return actionTool(services, {
    name: 'context',
    title: 'Read recent Discord messages',
    intro:
      'Read what was said recently in Discord, from the plugin’s memory of observed messages. People who asked through Discord must pass eventId.',
    annotations: READ_HINTS,
    operations: [],
    local: [
      contextAction(
        services,
        'recent',
        'Newest observed messages in the conversation of the request (same channel or thread).',
      ),
      contextAction(
        services,
        'user',
        'Newest observed messages by the person who asked, across approved server channels; a DM request sees only that DM.',
      ),
      contextAction(
        services,
        'search',
        'Case-insensitive literal text search over observed messages in the channel or thread of the request, newest first.',
      ),
      eventsAction(services),
    ],
  });
}

const READ_SHAPE = {
  ...MEDIA_READ.shape,
  channelId: SNOWFLAKE.optional().describe(
    'The channel the handle came from, when no eventId is given.',
  ),
};

function mediaActions(services: DiscordServices): readonly LocalAction[] {
  const { media, authority } = services;
  return [
    {
      action: 'search',
      description:
        'Latest, specific or several attachments or images in the bounded observed index of the same server (or the same DM). Filter by user, channel, message, IDs and time; newest first with a cursor. Incomplete; no search across all of Discord.',
      shape: MEDIA_SEARCH.shape,
      run: async (args, caller, eventId): Promise<LocalOutput> => {
        const input = MEDIA_SEARCH.parse(args);
        const reach = await authority.reach(caller, eventId, input.channelId);
        return plain(media.search(reach, input));
      },
    },
    {
      action: 'history',
      description:
        'Scan one channel history page or one exact message for attachments. Filter by user, message, time and kind. nextBefore pages through messages; truncated attachment references allow an exact follow-up.',
      shape: MEDIA_HISTORY.shape,
      run: async (args, caller, eventId): Promise<LocalOutput> => {
        const input = MEDIA_HISTORY.parse(args);
        const reach = await authority.reach(caller, eventId, input.channelId);
        return plain(await media.history(reach, input));
      },
    },
    {
      action: 'read',
      description:
        'Read up to 128 KiB of an attachment from a fresh handle (sourceId from search or history). Only Discord’s own file server is contacted. A complete small picture comes back as an image (imageContent true); larger files need chunks with offset.',
      shape: READ_SHAPE,
      run: async (args, caller, eventId): Promise<LocalOutput> => {
        const { channelId, ...rest } = z.object(READ_SHAPE).parse(args);
        const reach = await authority.reach(caller, eventId, channelId);
        const read = await media.read(reach, MEDIA_READ.parse(rest));
        if (read.complete && read.image) {
          return {
            response: { ...read.info, imageContent: true },
            pictures: [{ data: read.chunk, mimeType: read.mimeType }],
          };
        }
        return plain({ ...read.info, base64: read.chunk.toString('base64') });
      },
    },
  ];
}

export function mediaTool(services: DiscordServices): PluginTool {
  return actionTool(services, {
    name: 'media',
    title: 'Find and read Discord attachments',
    intro:
      'Find pictures and files people posted, then read them. People who asked through Discord must pass eventId.',
    annotations: READ_HINTS,
    operations: [],
    local: mediaActions(services),
  });
}
