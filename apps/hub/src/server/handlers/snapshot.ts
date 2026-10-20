import {
  ASSISTANT_MESSAGES_SNAPSHOT,
  API_ENDPOINTS as E,
  HEALTH_METRICS,
  NUTRITION_METRICS,
  WATCH_METRICS,
  SNAPSHOT_WINDOWS,
  TALK_MESSAGES_SNAPSHOT,
  type ClientRow,
  type EventRow,
  type OwnerSnapshotTables,
  type SnapshotTables,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { visibleHome, viewerOfClient } from '../../computers/computer-access';
import { phoneViewerOfClient } from '../../phones/phone-detail';
import { otherPhoneTiers, visibleEvents, visiblePhoneValues } from '../../phones/phone-visibility';
import { clientOf, profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { channelHidden, presenceInScope, scopesOfClient } from '../person-scope';
import { bodyTables } from '../person-privacy';
import { reachableSnapshot } from '../snapshot-reach';
import { wireMessages } from '../../assistant/wire-message';
import { DAY_MS } from '../../metrics/minute';

function dayOf(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

function lastLocalDayOf(now: Date): string {
  return dayOf(new Date(now.getTime() + DAY_MS));
}

function homeTables(
  store: Store,
  client: ClientRow,
): Pick<SnapshotTables, 'devices' | 'device_state' | 'television_settings'> {
  const { devices, state } = visibleHome(
    store,
    viewerOfClient(store, client),
    scopesOfClient(store, client)?.devices ?? null,
    { devices: store.devices.list(), state: store.state.list() },
  );
  const tiers = otherPhoneTiers(devices, phoneViewerOfClient(store, client));
  const visible = new Set(devices.map((device) => device.id));
  return {
    devices,
    device_state: visiblePhoneValues(tiers, state),
    television_settings: store.televisionSettings
      .list()
      .filter((settings) => visible.has(settings.device_id)),
  };
}

interface Viewer {
  readonly client: ClientRow;
  readonly profileId: string;
}

function snapshotEvents(store: Store, { client, profileId }: Viewer): EventRow[] {
  return visibleEvents(
    store,
    { role: client.role, profileId },
    store.events.list({ limit: SNAPSHOT_WINDOWS.events }),
  );
}

interface SnapshotExtras {
  readonly nutrition: boolean;
  readonly watch: boolean;
  readonly weather: boolean;
}

function unfilteredTablesOf(
  store: Store,
  { client, profileId }: Viewer,
  now: Date,
  extras: SnapshotExtras,
): SnapshotTables {
  const firstDay = new Date(now.getTime() - (SNAPSHOT_WINDOWS.healthDailyDays - 1) * DAY_MS);
  return {
    settings: store.settings.read(),
    rooms: store.rooms.list(),
    ...homeTables(store, client),
    device_groups: store.deviceGroups.list(),
    cameras: store.cameras.list(),
    scenes: store.scenes.list(),
    automations: store.automations.list(),
    automation_values: store.automationValues.list(),
    automation_runs: store.automationRunRecords.summaries(null, SNAPSHOT_WINDOWS.automationRuns),
    provider_links: store.providers.list(),
    ir_remotes: store.infrared.remotes(),
    ir_codes: store.infrared.codes(),
    layouts: store.personal.layouts({ clientId: client.id, profileId }),
    events: snapshotEvents(store, { client, profileId }),
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
    ...bodyTables(store, { role: client.role, profileId }),
    scheduled_actions: store.schedules.list(),
    plugin_streams: store.pluginData.streams(),
    plugin_ui: store.plugins.ui(),
    exchange_rates: store.exchangeRates.read(),
    ...(extras.weather ? { weather: store.weather.read() } : {}),
  };
}

function tablesOf(
  store: Store,
  viewer: Viewer,
  now: Date,
  extras: Parameters<typeof unfilteredTablesOf>[3],
): SnapshotTables {
  return reachableSnapshot(store, viewer.client, unfilteredTablesOf(store, viewer, now, extras));
}

function talkTablesOf(
  context: ServerContext,
  client: ClientRow,
): Pick<SnapshotTables, 'talk_channels' | 'talk_members' | 'talk_messages' | 'talk_presence'> {
  const { talk } = context.store;
  const scope = scopesOfClient(context.store, client)?.channels ?? null;
  return {
    talk_channels: talk.channels().filter((row) => !channelHidden(scope, row.id)),
    talk_members: talk.members().filter((row) => !channelHidden(scope, row.channel_id)),
    talk_messages: talk
      .messages({ limit: TALK_MESSAGES_SNAPSHOT })
      .filter((row) => !channelHidden(scope, row.channel_id)),
    talk_presence: presenceInScope(scope, context.talk.presence()),
  };
}

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

function ownerTablesOf(store: Store, client: ClientRow): OwnerSnapshotTables | null {
  if (client.role !== 'owner') {
    return null;
  }
  return {
    clients: store.clients.list(),
    push_targets: store.personal.pushTargets(),
    mcp_tokens: store.oauth.personalTokens(),
    oauth_clients: store.oauth.grants(),
    plugins: store.plugins.list(),
  };
}

export const snapshotRoutes = (context: ServerContext, now: () => Date) =>
  ({
    readSnapshot: bound(E.readSnapshot, async ({ caller, query }) => {
      const client = clientOf(caller);
      const profileId = profileIdOf(context.store, caller);
      const firewall = await context.firewall.current();
      return {
        seq: context.store.feed.seq,
        session: { client, hub: context.status() },
        firewall,
        tables: {
          ...tablesOf(context.store, { client, profileId }, now(), query),
          ...(query.talk ? talkTablesOf(context, client) : {}),
          ...(query.assistant ? assistantTablesOf(context, profileId) : {}),
        },
        owner: ownerTablesOf(context.store, client),
      };
    }),
  }) as const;
