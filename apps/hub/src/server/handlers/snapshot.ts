import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  API_ENDPOINTS as E,
  BODY_READINGS_SNAPSHOT,
  HEALTH_METRICS,
  NUTRITION_METRICS,
  WATCH_METRICS,
  SNAPSHOT_WINDOWS,
  automationRunForReader,
  automationRunVisible,
  TALK_MESSAGES_SNAPSHOT,
  type ClientRow,
  type OwnerSnapshotTables,
  type SnapshotTables,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type SnapshotRoutes = Record<'readSnapshot', Bound>;

const DAY_MS = 86_400_000;

function dayOf(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

function lastLocalDayOf(now: Date): string {
  return dayOf(new Date(now.getTime() + DAY_MS));
}

interface Viewer {
  readonly client: ClientRow;
  readonly profileId: string;
}

function tablesOf(
  store: Store,
  { client, profileId }: Viewer,
  now: Date,
  extras: {
    readonly nutrition: boolean;
    readonly watch: boolean;
    readonly weather: boolean;
    readonly automationRuntime: boolean;
    readonly groupRuntime: boolean;
    readonly automationRunDetails: boolean;
  },
): SnapshotTables {
  const firstDay = new Date(now.getTime() - (SNAPSHOT_WINDOWS.healthDailyDays - 1) * DAY_MS);
  return {
    settings: store.settings.read(),
    rooms: store.rooms.list(),
    devices: store.devices.list(),
    ...(extras.groupRuntime ? { device_groups: store.deviceGroups.list() } : {}),
    device_state: store.state.list(),
    cameras: store.cameras.list(),
    scenes: store.scenes.list(),
    automations: store.automations.list(),
    ...(extras.automationRuntime ? automationTablesOf(store, extras.automationRunDetails) : {}),
    provider_links: store.providers.list(),
    ir_remotes: store.infrared.remotes(),
    ir_codes: store.infrared.codes(),
    layouts: store.personal.layouts({ clientId: client.id, profileId }),
    events: store.events.list({ limit: SNAPSHOT_WINDOWS.events }),
    commands: store.commands.recent(SNAPSHOT_WINDOWS.commands),
    recordings: store.cameras.recordings({ limit: SNAPSHOT_WINDOWS.recordings }),
    health_sources: store.healthSources.list(),
    health_daily: store.health.dailyRange(
      profileId,
      dayOf(firstDay),
      lastLocalDayOf(now),
      HEALTH_METRICS.filter(
        (metric) =>
          (extras.nutrition || !NUTRITION_METRICS.has(metric)) &&
          (extras.watch || !WATCH_METRICS.has(metric)),
      ),
    ),
    profiles: store.profiles.list(),
    body_readings: store.bodyReadings.recent(BODY_READINGS_SNAPSHOT),
    scheduled_actions: store.schedules.list(),
    plugin_streams: store.pluginData.streams(),
    exchange_rates: store.exchangeRates.read(),
    ...(extras.weather ? { weather: store.weather.read() } : {}),
  };
}

function automationTablesOf(
  store: Store,
  details: boolean,
): Pick<SnapshotTables, 'automation_values' | 'automation_runs' | 'automation_sequences'> {
  return {
    automation_values: store.automationValues.list(),
    ...(details ? { automation_sequences: store.automationSequences.list() } : {}),
    automation_runs: store.automationRuns
      .list()
      .filter((run) => automationRunVisible(run, details))
      .map((run) => automationRunForReader(run, details)),
  };
}

function talkTablesOf(
  context: ServerContext,
): Pick<SnapshotTables, 'talk_channels' | 'talk_members' | 'talk_messages' | 'talk_presence'> {
  const { talk } = context.store;
  return {
    talk_channels: talk.channels(),
    talk_members: talk.members(),
    talk_messages: talk.messages({ limit: TALK_MESSAGES_SNAPSHOT }),
    talk_presence: context.talk.presence(),
  };
}

function assistantTablesOf(
  context: ServerContext,
  profileId: string,
): Pick<SnapshotTables, 'assistant_messages' | 'assistant_status' | 'ai_chats' | 'chat_activity'> {
  return {
    assistant_messages: context.store.assistantChat.recent(profileId, ASSISTANT_MESSAGES_SNAPSHOT),
    assistant_status: context.assistant.status(),
    ai_chats: context.store.aiChats.chats({ profileId, archived: false }),
    chat_activity: context.assistant.activity(profileId),
  };
}

function ownerTablesOf(store: Store, client: ClientRow): OwnerSnapshotTables | null {
  if (client.role !== 'owner') {
    return null;
  }
  return {
    clients: store.clients.list(),
    push_targets: store.personal.pushTargets(),
    mcp_tokens: store.assistant.tokens(),
    oauth_clients: store.assistant.grants(),
    plugins: store.plugins.list(),
  };
}

export function snapshotRoutes(context: ServerContext, now: () => Date): SnapshotRoutes {
  const { store } = context;
  return {
    readSnapshot: bound(E.readSnapshot, async ({ caller, query }) => {
      const client = clientOf(caller);
      const profileId = profileIdOf(store, caller);
      const firewall = await context.firewall.current();
      return {
        seq: store.feed.seq,
        session: { client, hub: context.status() },
        firewall,
        tables: {
          ...tablesOf(store, { client, profileId }, now(), query),
          ...(query.talk ? talkTablesOf(context) : {}),
          ...(query.assistant ? assistantTablesOf(context, profileId) : {}),
        },
        owner: ownerTablesOf(store, client),
      };
    }),
  };
}
