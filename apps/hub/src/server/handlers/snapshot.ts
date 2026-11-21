import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  API_ENDPOINTS as E,
  type SnapshotTables,
} from '@smarteverything/domain';
import { clientOf, profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { wireMessages } from '../../assistant/wire-message';

function assistantTablesOf(
  context: ServerContext,
  profileId: string,
): Pick<SnapshotTables, 'assistant_messages' | 'assistant_status' | 'ai_chats' | 'chat_activity'> {
  return {
    assistant_messages: wireMessages(
      context.store.assistantChat.recent(profileId, ASSISTANT_MESSAGES_SNAPSHOT),
    ),
    assistant_status: context.assistant.status(),
    ai_chats: context.store.aiChats.chats({ profileId, archived: false }),
    chat_activity: context.assistant.activity(profileId),
  };
}

export const snapshotRoutes = (context: ServerContext, now: () => Date) =>
  ({
    readSnapshot: bound(E.readSnapshot, async ({ caller, query }) => {
      const client = clientOf(caller);
      const profileId = profileIdOf(caller);
      const seq = context.store.feed.seq;
      const [firewall, snapshot] = await Promise.all([
        context.firewall.current(),
        context.store.host.read('snapshotTables', {
          client,
          profileId,
          now: now().toISOString(),
          extras: {
            nutrition: query.nutrition,
            watch: query.watch,
            weather: query.weather,
            talkPresence: query.talk ? context.talk.presence() : null,
            pluginStreams: await context.store.live.pluginStreams.streams(),
          },
        }),
      ]);
      return {
        seq,
        session: { client, hub: context.status() },
        firewall,
        tables: {
          ...snapshot.tables,
          ...(query.assistant ? assistantTablesOf(context, profileId) : {}),
        },
        owner: snapshot.owner,
      };
    }),
  }) as const;
