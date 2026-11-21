import {
  HEALTH_METRICS,
  NUTRITION_METRICS,
  WATCH_METRICS,
  SNAPSHOT_WINDOWS,
  TALK_MESSAGES_SNAPSHOT,
  type ClientRow,
  type EventRow,
  type OwnerSnapshotTables,
  type DriveGrant,
  type DrivePlacement,
  type DriveRoot,
  type SnapshotTables,
  type TalkPresence,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { visibleHome, viewerOfClient } from '../computers/computer-visibility';
import { phoneViewerOfClient } from '../phones/phone-detail';
import { otherPhoneTiers, visibleEvents, visiblePhoneValues } from '../phones/phone-visibility';
import { channelHidden, presenceInScope, scopesOfClient } from './person-scope';
import { bodyTables } from './person-privacy';
import { reachableSnapshot } from './snapshot-reach';
import { rootVisible } from '../drive/access';
import { DAY_MS } from '../metrics/minute';
import { visibleCollections } from '../planner/sharing/visibility';
import { storeUnit } from '../store/host/unit';

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

function visibleDriveRoots(store: Store, { profileId }: Pick<Viewer, 'profileId'>): DriveRoot[] {
  return store.driveRoots.records().filter((root) => rootVisible(store, { profileId }, root));
}

export function ownDrivePlacements(
  store: Pick<Store, 'drivePlacements' | 'computerNodes'>,
  { profileId }: Pick<Viewer, 'profileId'>,
): DrivePlacement[] {
  return store.drivePlacements
    .list()
    .filter((placement) => store.computerNodes.personOf(placement.deviceId) === profileId);
}

function visibleDriveGrants(store: Store, { profileId }: Viewer): DriveGrant[] {
  const received = store.driveGrants.receivedBy(profileId);
  const known = new Set(received.map((grant) => grant.id));
  return [
    ...received,
    ...store.driveGrants.madeBy(profileId).filter((grant) => !known.has(grant.id)),
  ];
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

type PlannerSnapshot = Pick<
  SnapshotTables,
  | 'planner_collections'
  | 'planner_items'
  | 'planner_occurrences'
  | 'planner_alarms'
  | 'planner_timers'
  | 'planner_stopwatches'
  | 'planner_collection_shares'
  | 'planner_guests'
  | 'planner_booking_pages'
  | 'google_accounts'
>;

function present<Row>(row: Row | undefined): Row[] {
  return row === undefined ? [] : [row];
}

function sharesOf(
  store: Store,
  people: readonly string[],
): PlannerSnapshot['planner_collection_shares'] {
  const shares = people.flatMap((person) => [
    ...store.plannerShares.forProfile(person),
    ...store.plannerCollections
      .list(person)
      .flatMap((collection) => store.plannerShares.forCollection(collection.id)),
  ]);
  return [
    ...new Map(
      shares.map((share) => [`${share.collection_id}/${share.profile_id}`, share]),
    ).values(),
  ];
}

export function plannerTablesOf(store: Store, { client, profileId }: Viewer): PlannerSnapshot {
  const people =
    client.role === 'owner' ? store.profiles.list().map((profile) => profile.id) : [profileId];
  const everything = client.role === 'owner';
  const items = everything
    ? people.flatMap((person) => store.plannerItems.list(person))
    : store.plannerItems.list(profileId, { scope: 'visible' });
  return {
    planner_collections: everything
      ? people.flatMap((person) => store.plannerCollections.list(person))
      : visibleCollections(store, profileId),
    planner_items: items,
    planner_occurrences: store.plannerOccurrences.forItems(items.map((item) => item.id)),
    planner_alarms: people.flatMap((person) => store.plannerAlarms.list(person)),
    planner_timers: people.flatMap((person) => store.plannerTimers.list(person)),
    planner_stopwatches: people.flatMap((person) => present(store.plannerStopwatch.find(person))),
    planner_collection_shares: sharesOf(store, people),
    planner_guests: store.plannerGuests.forItems(items.map((item) => item.id)),
    planner_booking_pages: people.flatMap((person) => store.plannerBookingPages.list(person)),
    google_accounts: people.flatMap((person) => present(store.googleAccounts.find(person))),
  };
}

export interface SnapshotExtras {
  readonly nutrition: boolean;
  readonly watch: boolean;
  readonly weather: boolean;
  readonly talkPresence: TalkPresence | null;
  readonly pluginStreams: NonNullable<SnapshotTables['plugin_streams']>;
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
    automations: store.automations.list(),
    automation_values: store.automationValues.list(),
    automation_plugin_kinds: store.pluginKinds.all(),
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
    ...plannerTablesOf(store, { client, profileId }),
    scheduled_actions: store.schedules.list(),
    plugin_streams: [...extras.pluginStreams],
    plugin_ui: store.plugins.ui(),
    drive_roots: visibleDriveRoots(store, { profileId }),
    drive_grants: visibleDriveGrants(store, { client, profileId }),
    drive_placements: ownDrivePlacements(store, { profileId }),
    model_assets: store.modelAssets.all(),
    model_catalog: store.modelCatalog.all(),
    model_overrides: store.modelOverrides.all(),
    exchange_rates: store.exchangeRates.read(),
    ...(extras.weather ? { weather: store.weather.read() } : {}),
  };
}

type TalkTables = Pick<
  SnapshotTables,
  'talk_channels' | 'talk_members' | 'talk_messages' | 'talk_presence'
>;

function talkTablesOf(store: Store, client: ClientRow, presence: TalkPresence): TalkTables {
  const { talk } = store;
  const scope = scopesOfClient(store, client)?.channels ?? null;
  return {
    talk_channels: talk.channels().filter((row) => !channelHidden(scope, row.id)),
    talk_members: talk.members().filter((row) => !channelHidden(scope, row.channel_id)),
    talk_messages: talk
      .messages({ limit: TALK_MESSAGES_SNAPSHOT })
      .filter((row) => !channelHidden(scope, row.channel_id)),
    talk_presence: presenceInScope(scope, presence),
  };
}

function tablesOf(
  store: Store,
  viewer: Viewer,
  now: Date,
  extras: Parameters<typeof unfilteredTablesOf>[3],
): SnapshotTables {
  return {
    ...reachableSnapshot(store, viewer.client, unfilteredTablesOf(store, viewer, now, extras)),
    ...(extras.talkPresence === null
      ? {}
      : talkTablesOf(store, viewer.client, extras.talkPresence)),
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

export interface SnapshotTablesInput {
  readonly client: ClientRow;
  readonly profileId: string;
  readonly now: string;
  readonly extras: SnapshotExtras;
}

export const SNAPSHOT_TABLES_UNIT = storeUnit((store, input: SnapshotTablesInput) => ({
  tables: tablesOf(
    store,
    { client: input.client, profileId: input.profileId },
    new Date(input.now),
    input.extras,
  ),
  owner: ownerTablesOf(store, input.client),
}));
