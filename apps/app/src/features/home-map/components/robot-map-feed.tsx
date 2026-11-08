import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import type { AppHref } from '../../../components/app-href';
import type {
  HomeMap,
  HomeMapFeed,
  HomeMapFeedAssignment,
  HomeMapFeedTarget,
  HomeMapSummary,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { NavRow, SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import type { SelectOption } from '../../../components/select-picker';
import { Text } from '../../../components/text';
import { homeMapRenderScene } from '../../../components/house-map/adapters/home-map-scene';
import { IsoStill } from '../../../components/house-map/iso/iso-still';
import { href } from '../../../app-shell/hrefs';
import { moment } from '../../../format/time';
import { useScreenPaused } from '../../../design/screen-pause';
import { useMinute } from '../../../store/clock';
import { useDevices } from '../../../store/selectors';
import { homeMapQueryOptions } from '../data/home-map-query';
import {
  useHomeMapSet,
  useHomeMapSetActions,
  useRobotMapFeeds,
  type HomeMapSetOutcome,
} from '../data/map-set-query';
import { HOME_MAPS_PATH } from '../settings';

export const ROBOT_MAPS_PATH = `${HOME_MAPS_PATH}/robot-maps`;

export const NOT_USED = 'none';

export const UPDATES_AUTOMATICALLY = 'Updates automatically';

export function robotMapsHref(): AppHref {
  return href.settings.page(ROBOT_MAPS_PATH);
}

export interface FeedTarget {
  readonly key: string;
  readonly label: string;
  readonly assignment: HomeMapFeedAssignment;
}

export function targetKeyOf(target: HomeMapFeedTarget | null): string {
  return target === null ? NOT_USED : `${target.mapId}/${target.floorId}`;
}

export function feedTargets(maps: readonly HomeMap[]): readonly FeedTarget[] {
  const floors = maps.flatMap((map) =>
    map.floors.map((floor) => ({
      key: targetKeyOf({ mapId: map.id, floorId: floor.id }),
      label: map.floors.length === 1 ? map.name : `${map.name} · ${floor.name}`,
      assignment: { mapId: map.id, floorId: floor.id },
    })),
  );
  return [...floors, { key: NOT_USED, label: 'Not used', assignment: { target: null } }];
}

export function robotMapTitle(feed: HomeMapFeed): string {
  return feed.robotMapName === null
    ? `Robot map ${String(feed.robotMapId)}`
    : `Robot map "${feed.robotMapName}"`;
}

const sameFeed = (a: HomeMapFeed, b: HomeMapFeed): boolean =>
  a.deviceId === b.deviceId && a.robotMapId === b.robotMapId;

export function takenNote(
  feeds: readonly HomeMapFeed[],
  feed: HomeMapFeed,
  key: string,
  deviceName: (deviceId: string) => string,
): string | undefined {
  if (key === NOT_USED) return undefined;
  const others = feeds.filter(
    (other) => !sameFeed(other, feed) && targetKeyOf(other.target) === key,
  );
  if (others.length === 0) return undefined;
  const names = others.map((other) =>
    other.deviceId === feed.deviceId
      ? robotMapTitle(other)
      : `${robotMapTitle(other)} of ${deviceName(other.deviceId)}`,
  );
  return `Fed by ${names.join(', ')}`;
}

export function targetOptions(
  feeds: readonly HomeMapFeed[],
  feed: HomeMapFeed,
  targets: readonly FeedTarget[],
  deviceName: (deviceId: string) => string,
): readonly SelectOption<string>[] {
  return targets.map((target) => {
    const note = takenNote(feeds, feed, target.key, deviceName);
    return note === undefined
      ? { value: target.key, label: target.label }
      : { value: target.key, label: target.label, description: note };
  });
}

export function feedSummaryLines(
  feeds: readonly HomeMapFeed[],
  targets: readonly FeedTarget[],
  deviceName: (deviceId: string) => string,
): readonly string[] {
  const labelOf = (feed: HomeMapFeed): string =>
    targets.find((target) => target.key === targetKeyOf(feed.target))?.label ?? 'Not used';
  const devices = [...new Set(feeds.map((feed) => feed.deviceId))];
  return devices.map((deviceId) => {
    const pairs = feeds
      .filter((feed) => feed.deviceId === deviceId)
      .map((feed) => `${feed.robotMapName ?? String(feed.robotMapId)} → ${labelOf(feed)}`);
    return `${deviceName(deviceId)}: ${pairs.join(' · ')}`;
  });
}

export function lastUpdateLine(
  maps: readonly HomeMap[],
  deviceIds: ReadonlySet<string>,
  now: number,
): string {
  const moments = maps
    .flatMap((map) => map.sources)
    .filter((source) => deviceIds.has(source.deviceId))
    .flatMap((source) => (source.lastImportedAt === null ? [] : [source.lastImportedAt]));
  const latest = moments.reduce<string | null>(
    (held, at) => (held === null || Date.parse(at) > Date.parse(held) ? at : held),
    null,
  );
  return latest === null
    ? UPDATES_AUTOMATICALLY
    : `${UPDATES_AUTOMATICALLY} · last update ${moment(latest, now)}`;
}

const PROBLEMS: Readonly<Record<'offline' | 'unconfirmed', string>> = {
  offline: 'Connect to the hub to change which floor this map feeds',
  unconfirmed: "Couldn't confirm the change · Try again",
};

export function feedProblemOf(outcome: HomeMapSetOutcome<HomeMapFeed>): string | null {
  if (outcome.kind === 'done') return null;
  return outcome.kind === 'refused' ? outcome.message : PROBLEMS[outcome.kind];
}

export interface FeedData {
  readonly feeds: readonly HomeMapFeed[] | null;
  readonly maps: readonly HomeMap[];
  readonly targets: readonly FeedTarget[];
  readonly deviceName: (deviceId: string) => string;
}

function orderedIds(summaries: readonly HomeMapSummary[] | null): readonly HomeMapSummary['id'][] {
  return [...(summaries ?? [])].sort((a, b) => a.position - b.position).map((map) => map.id);
}

export function useFeedData(): FeedData {
  const feeds = useRobotMapFeeds();
  const { maps: summaries } = useHomeMapSet();
  const devices = useDevices();
  const paused = useScreenPaused();
  const ids = orderedIds(summaries);
  const documents = useQueries({
    queries: ids.map((id) => ({ ...homeMapQueryOptions(id), subscribed: !paused })),
  });
  const maps = documents.flatMap((query) => (query.data === undefined ? [] : [query.data]));
  const targets = feedTargets(maps);
  const deviceName = (deviceId: string): string =>
    devices.find((device) => device.id === deviceId)?.label ?? 'Robot vacuum';
  return { feeds, maps, targets, deviceName };
}

const THUMB = 'h-20 w-28 overflow-hidden rounded-md bg-surface-2';

function FeedThumb({
  feed,
  maps,
}: {
  readonly feed: HomeMapFeed;
  readonly maps: readonly HomeMap[];
}): ReactNode {
  const target = feed.target;
  const map = target === null ? undefined : maps.find((held) => held.id === target.mapId);
  const floor = useMemo(() => {
    if (map === undefined || target === null) return undefined;
    return homeMapRenderScene({ map, live: {} }).floors.find((held) => held.id === target.floorId);
  }, [map, target]);
  if (floor === undefined) {
    return (
      <View aria-hidden className={`${THUMB} items-center justify-center`}>
        <Icon name="route" size={32} tone="variant" />
      </View>
    );
  }
  return (
    <View className={THUMB}>
      <IsoStill input={{ floor }} name={robotMapTitle(feed)} fill />
    </View>
  );
}

export interface FeedCardProps {
  readonly feed: HomeMapFeed;
  readonly data: FeedData;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onPick: (target: FeedTarget) => void;
  readonly extra?: ReactNode;
}

export function FeedCard({ feed, data, busy, problem, onPick, extra }: FeedCardProps): ReactNode {
  const options = targetOptions(data.feeds ?? [], feed, data.targets, data.deviceName);
  const sub = `${data.deviceName(feed.deviceId)}${feed.isCurrent ? ' · the robot uses it now' : ''}`;
  return (
    <List>
      <View className="min-h-touch-min flex-row items-center gap-3 px-4 py-3">
        <FeedThumb feed={feed} maps={data.maps} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">{robotMapTitle(feed)}</Text>
          <Text variant="footnote" tone="variant">
            {sub}
          </Text>
        </View>
      </View>
      <SelectRow
        title="Feeds"
        icon="plan"
        options={options}
        value={targetKeyOf(feed.target)}
        disabled={busy}
        onChange={(key) => {
          const target = data.targets.find((held) => held.key === key);
          if (target !== undefined) onPick(target);
        }}
      />
      {problem === null ? null : (
        <Text variant="footnote" tone="critical" className="px-4 py-2">
          {problem}
        </Text>
      )}
      {extra}
    </List>
  );
}

function useFeedPick(feed: HomeMapFeed): {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly pick: (target: FeedTarget) => void;
} {
  const actions = useHomeMapSetActions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (target: FeedTarget): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const outcome = await actions.setFeed(feed.deviceId, feed.robotMapId, target.assignment);
    setBusy(false);
    setProblem(feedProblemOf(outcome));
  };
  return {
    busy,
    problem,
    pick: (target): void => {
      if (busy || target.key === targetKeyOf(feed.target)) return;
      background(run(target), 'home_map.set_feed_failed');
    },
  };
}

function LiveFeedCard({
  feed,
  data,
  extra,
}: {
  readonly feed: HomeMapFeed;
  readonly data: FeedData;
  readonly extra?: ReactNode;
}): ReactNode {
  const { busy, problem, pick } = useFeedPick(feed);
  return (
    <FeedCard feed={feed} data={data} busy={busy} problem={problem} onPick={pick} extra={extra} />
  );
}

export interface RobotMapFeedProps {
  readonly variant: 'cards' | 'summary';
  readonly deviceId?: string;
  readonly mapId?: string;
  readonly title?: string;
  readonly renderCardExtra?: (feed: HomeMapFeed) => ReactNode;
}

export function feedsIn(
  feeds: readonly HomeMapFeed[],
  scope: Pick<RobotMapFeedProps, 'deviceId' | 'mapId'>,
): readonly HomeMapFeed[] {
  return feeds.filter(
    (feed) =>
      (scope.deviceId === undefined || feed.deviceId === scope.deviceId) &&
      (scope.mapId === undefined || feed.target?.mapId === scope.mapId),
  );
}

export const FEED_TITLE = 'Which robot map feeds which floor';

export function RobotMapFeed({
  variant,
  deviceId,
  mapId,
  title = FEED_TITLE,
  renderCardExtra,
}: RobotMapFeedProps): ReactNode {
  const data = useFeedData();
  const now = useMinute();
  const scope = {
    ...(deviceId === undefined ? {} : { deviceId }),
    ...(mapId === undefined ? {} : { mapId }),
  };
  const shown = feedsIn(data.feeds ?? [], scope);
  const update = lastUpdateLine(data.maps, new Set(shown.map((feed) => feed.deviceId)), now);
  if (variant === 'summary') {
    const lines = feedSummaryLines(shown, data.targets, data.deviceName);
    return (
      <NavRow
        title={title}
        icon="route"
        subtitle={[...(lines.length === 0 ? ['No robot map yet'] : lines), update].join('\n')}
        wrapSubtitle
        href={robotMapsHref()}
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Text variant="footnote" tone="variant" className="px-4">
        {update}
      </Text>
      {shown.map((feed) => (
        <LiveFeedCard
          key={`${feed.deviceId}:${String(feed.robotMapId)}`}
          feed={feed}
          data={data}
          {...(renderCardExtra === undefined ? {} : { extra: renderCardExtra(feed) })}
        />
      ))}
    </View>
  );
}
