import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type HOME_MAP_NOTICE_ACTIONS,
  type HomeMap,
  type HomeMapId,
  type HomeMapNotice,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { Button } from '../../../../components/button';
import { Icon, type IconName } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { STATUS_CONTAINER, type StatusTone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { homeMapQueryKey, refetchHomeMap } from '../../data/home-map-query';

const log = new Logger('app.home-map');

export type NoticeAction = (typeof HOME_MAP_NOTICE_ACTIONS)[number];

export interface NoticeChoice {
  readonly action: NoticeAction | 'align';
  readonly label: string;
  readonly primary: boolean;
}

export const NOTICES_LABEL = 'Robot map notices';

export const ROBOT_SPLIT_PREFIX = 'The robot split';

export const MAP_JOB_FAILED = 'That did not go through. Check the connection and try again.';

const KEEP: NoticeChoice = { action: 'keep_mine', label: 'Dismiss', primary: false };

const ALIGN: NoticeChoice = { action: 'align', label: 'Align with two points', primary: true };

export function noticeChoices(notice: Pick<HomeMapNotice, 'kind' | 'detail'>): NoticeChoice[] {
  switch (notice.kind) {
    case 'source_changed':
      return notice.detail.startsWith(ROBOT_SPLIT_PREFIX)
        ? [
            { action: 'split_like_source', label: 'Split like the robot', primary: true },
            { action: 'keep_mine', label: 'Keep it as it is', primary: false },
          ]
        : [
            { action: 'use_source', label: "Use the robot's shape", primary: true },
            { action: 'keep_mine', label: 'Keep mine', primary: false },
          ];
    case 'source_missing':
      return [
        { action: 'keep_mine', label: 'Keep as a hand drawn room', primary: true },
        { action: 'delete', label: 'Delete the room', primary: false },
      ];
    case 'source_moved':
    case 'source_new_robot_map':
      return [ALIGN, KEEP];
    case 'link_stale':
      return [KEEP];
  }
}

interface NoticeLook {
  readonly title: string;
  readonly icon: IconName;
  readonly tone: StatusTone;
}

const LOOK: Readonly<Record<HomeMapNotice['kind'], NoticeLook>> = {
  source_changed: { title: 'The robot sees this room differently', icon: 'vacuum', tone: 'info' },
  source_missing: { title: 'A room left the robot map', icon: 'warning', tone: 'warning' },
  source_moved: { title: "The robot's map moved", icon: 'move', tone: 'warning' },
  link_stale: { title: 'A room link is out of date', icon: 'info', tone: 'info' },
  source_new_robot_map: { title: 'The robot made a new map', icon: 'vacuum', tone: 'warning' },
};

export function noticeLook(kind: HomeMapNotice['kind']): NoticeLook {
  return LOOK[kind];
}

export function roomNameOf(map: Pick<HomeMap, 'floors'>, elementId: string): string | null {
  for (const floor of map.floors) {
    const room = floor.rooms.find((entry) => entry.id === elementId);
    if (room !== undefined) return room.name ?? 'Unnamed room';
  }
  return null;
}

export async function catchUpTo(
  client: QueryClient,
  mapId: HomeMapId | undefined,
  revision: number,
): Promise<void> {
  const cached = client.getQueryData<HomeMap>(homeMapQueryKey(mapId));
  if (cached === undefined || cached.revision < revision) await refetchHomeMap(client, mapId);
}

export interface MapJob {
  readonly busy: boolean;
  readonly failure: string | null;
  readonly start: (event: string, job: () => Promise<number>) => void;
}

export function useMapJob(mapId: HomeMapId | undefined): MapJob {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const start = (event: string, job: () => Promise<number>): void => {
    setBusy(true);
    setFailure(null);
    job()
      .then((revision) => catchUpTo(client, mapId, revision))
      .catch((error: unknown) => {
        log.error(event, error);
        setFailure(MAP_JOB_FAILED);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, failure, start };
}

export async function resolveNotice(
  mapId: HomeMapId,
  noticeId: string,
  action: NoticeAction,
): Promise<number> {
  const answer = await api().call(E.resolveHomeMapNotice, {
    params: { noticeId },
    body: { action },
    query: { mapId },
  });
  return answer.revision;
}

interface CardProps {
  readonly notice: HomeMapNotice;
  readonly room: string | null;
  readonly disabled: boolean;
  readonly onChoose: (choice: NoticeChoice) => void;
}

function NoticeCard({ notice, room, disabled, onChoose }: CardProps): ReactNode {
  const look = noticeLook(notice.kind);
  return (
    <View
      accessibilityRole="summary"
      className={cn('gap-2 rounded-lg p-3', STATUS_CONTAINER[look.tone])}
    >
      <View className="flex-row items-center gap-2">
        <Icon name={look.icon} size={20} tone={look.tone} />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{look.title}</Text>
          {room === null ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {room}
            </Text>
          )}
        </View>
      </View>
      <Text variant="callout" tone="variant">
        {notice.detail}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {noticeChoices(notice).map((choice) => (
          <Button
            key={choice.action}
            label={choice.label}
            variant={choice.primary ? 'tonal' : 'text'}
            disabled={disabled}
            onPress={(): void => {
              onChoose(choice);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export interface HomeMapNoticesProps {
  readonly map: HomeMap;
  readonly mapId?: HomeMapId;
  readonly readOnly: boolean;
  readonly onAlign: (sourceId: string) => void;
}

export function HomeMapNotices({ map, mapId, readOnly, onAlign }: HomeMapNoticesProps): ReactNode {
  const job = useMapJob(mapId);
  if (map.notices.length === 0) return null;
  return (
    <View accessibilityLabel={NOTICES_LABEL} className="gap-2">
      {map.notices.map((notice) => (
        <NoticeCard
          key={notice.id}
          notice={notice}
          room={roomNameOf(map, notice.elementId)}
          disabled={readOnly || job.busy}
          onChoose={(choice): void => {
            if (choice.action === 'align') {
              onAlign(notice.elementId);
              return;
            }
            const { action } = choice;
            job.start('home_map.notice_failed', () => resolveNotice(map.id, notice.id, action));
          }}
        />
      ))}
      <JobFailure text={job.failure} />
    </View>
  );
}

export function JobFailure({ text }: { readonly text: string | null }): ReactNode {
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

export type ImportStatus = 'imported' | 'unchanged' | 'pending';

export const IMPORT_LINES: Readonly<Record<ImportStatus, string>> = {
  imported: 'Imported. The rooms are on the map: check them and line them up if needed.',
  unchanged: 'The map already matches the robot. Nothing changed.',
  pending: 'The robot is cleaning. Its map is imported as soon as it is back on the dock or done.',
};

export interface ImportStepProps {
  readonly mapId: HomeMapId | undefined;
  readonly target: HomeMapId;
  readonly deviceId: string;
  readonly floorId: string | null;
  readonly imported: boolean;
  readonly readOnly: boolean;
}

export function ImportStep(props: ImportStepProps): ReactNode {
  const { deviceId, floorId } = props;
  const job = useMapJob(props.mapId);
  const [line, setLine] = useState<string | null>(null);
  return (
    <View className="gap-2">
      <Text variant="label" tone="variant">
        3 · Import
      </Text>
      <Button
        label={props.imported ? 'Update from the robot' : 'Import the robot map'}
        icon="download"
        loading={job.busy}
        disabled={props.readOnly || job.busy}
        onPress={(): void => {
          job.start('home_map.import_failed', async () => {
            const answer = await api().call(E.importHomeMapSource, {
              body: { kind: 'xiaomi_vacuum', deviceId, ...(floorId === null ? {} : { floorId }) },
              query: { mapId: props.target },
            });
            setLine(IMPORT_LINES[answer.status]);
            return answer.revision;
          });
        }}
      />
      {line === null ? null : (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {line}
        </Text>
      )}
      <JobFailure text={job.failure} />
    </View>
  );
}

export const ROBOT_REACH = {
  title: 'What reaches the robot',
  sends: [
    'Cleaning zones and no-go areas you draw on this map',
    'Floor material, where the robot knows that material',
    'Which home room each robot room is linked to',
  ],
  never: [
    'Room shapes, splits and merges',
    'Walls, doors and windows',
    'Furniture, devices, paint and notes',
    'Room names: the robot shows the name of the linked home room',
  ],
} as const;

function ReachList({
  icon,
  tone,
  heading,
  items,
}: {
  readonly icon: IconName;
  readonly tone: 'positive' | 'faint';
  readonly heading: string;
  readonly items: readonly string[];
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Text variant="label" tone="variant">
        {heading}
      </Text>
      {items.map((item) => (
        <View key={item} className="flex-row items-start gap-2">
          <Icon name={icon} size={16} tone={tone} />
          <Text variant="footnote" className="min-w-0 flex-1">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RobotReach(): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">{ROBOT_REACH.title}</Text>
      <ReachList icon="check" tone="positive" heading="Sent" items={ROBOT_REACH.sends} />
      <ReachList icon="ban" tone="faint" heading="Stays on this map" items={ROBOT_REACH.never} />
    </View>
  );
}
