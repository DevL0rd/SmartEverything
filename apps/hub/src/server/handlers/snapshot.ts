import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  API_ENDPOINTS as E,
  type SnapshotTables,
} from '@smarteverything/domain';
import { clientOf, profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { wireMessages } from '../../assistant/wire-message';

type AssistantTables = Pick<
  SnapshotTables,
  'assistant_messages' | 'assistant_status' | 'ai_chats' | 'chat_activity'
>;

async function assistantTablesOf(
  context: ServerContext,
  profileId: string,
): Promise<AssistantTables> {
  const { host } = context.store;
  const [messages, chats] = await Promise.all([
    host.call('assistantChat', 'recent', profileId, ASSISTANT_MESSAGES_SNAPSHOT),
    host.call('aiChats', 'chats', { profileId, archived: false }),
  ]);
  return {
    assistant_messages: wireMessages(messages),
    assistant_status: context.assistant.status(),
    ai_chats: chats,
    chat_activity: await context.assistant.activity(profileId),
  };
}

export const snapshotRoutes = (context: ServerContext, now: () => Date) =>
  ({
    readSnapshot: bound(E.readSnapshot, async ({ caller, query }) => {
      const client = clientOf(caller);
      const profileId = profileIdOf(caller);
      const seq = context.store.feed.seq;
      const [firewall, assistant, snapshot] = await Promise.all([
        context.firewall.current(),
        query.assistant ? assistantTablesOf(context, profileId) : null,
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
          ...assistant,
        },
        owner: snapshot.owner,
      };
    }),
  }) as const;
