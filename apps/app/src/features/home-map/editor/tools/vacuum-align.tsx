import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  API_ENDPOINTS as E,
  vacuumSceneToSourceGeometry,
  type HomeMap,
  type HomeMapId,
  type HomeMapSource,
  type HomeMapVec,
  type VacuumSceneAnswer,
} from '@smarteverything/domain';
import { api } from '../../../../api/transport';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { Text } from '../../../../components/text';
import type { RenderBounds } from '../../../../components/house-map/render-scene';
import { cn } from '../../../../design/cn';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { compareText } from '../../../../format/text';
import { HomeMapNotices, ImportStep, JobFailure, RobotReach, useMapJob } from './notices';

export const ALIGN_LABEL = 'Vacuum map import and align';

export const ALIGN_STEPS_LABEL = 'Line up the robot map';

const PREVIEW_LINE = 'The robot map is the dashed blue outline on the floor.';

export type Ring = readonly HomeMapVec[];

export interface AlignPair {
  readonly source: HomeMapVec | null;
  readonly house: HomeMapVec | null;
}

export type AlignDraft = readonly [AlignPair, AlignPair];

export type AlignSide = 'source' | 'house';

export type AlignTarget = { readonly pair: 0 | 1; readonly side: AlignSide } | null;

export type StepState = 'done' | 'active' | 'waiting';

export const EMPTY_ALIGN: AlignDraft = [
  { source: null, house: null },
  { source: null, house: null },
];

export interface RobotCandidate {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly provider: string;
}

export function vacuumRobots<T extends RobotCandidate>(devices: readonly T[]): T[] {
  return devices
    .filter((device) => device.kind === 'vacuum' && device.provider === 'xiaomi')
    .sort((a, b) => compareText(a.name, b.name));
}

export function alignTarget(draft: AlignDraft): AlignTarget {
  for (const pair of [0, 1] as const) {
    if (draft[pair].source === null) return { pair, side: 'source' };
    if (draft[pair].house === null) return { pair, side: 'house' };
  }
  return null;
}

export function alignTap(draft: AlignDraft, side: AlignSide, at: HomeMapVec): AlignDraft {
  const target = alignTarget(draft);
  if (target?.side !== side) return draft;
  const pair = { ...draft[target.pair], [side]: at };
  return target.pair === 0 ? [pair, draft[1]] : [draft[0], pair];
}

type WirePair = Readonly<Record<AlignSide, Pick<HomeMapVec, 'x' | 'y'>>>;

export type AlignPoints = readonly [WirePair, WirePair];

export function alignPoints([a, b]: AlignDraft): AlignPoints | null {
  if (a.source === null || a.house === null || b.source === null || b.house === null) return null;
  return [
    { source: { ...a.source }, house: { ...a.house } },
    { source: { ...b.source }, house: { ...b.house } },
  ];
}

export function stepText(pair: 0 | 1, side: AlignSide): string {
  const point = String(pair + 1);
  return side === 'source'
    ? `Tap point ${point} on the blue robot map`
    : `Tap the same spot as point ${point} on the floor`;
}

export function alignPrompt(draft: AlignDraft): string {
  const target = alignTarget(draft);
  if (target === null) return 'All four points are set. Save the alignment.';
  return stepText(target.pair, target.side);
}

const STEPS = [
  { pair: 0, side: 'source' },
  { pair: 0, side: 'house' },
  { pair: 1, side: 'source' },
  { pair: 1, side: 'house' },
] as const;

export function stepStates(draft: AlignDraft): readonly StepState[] {
  const target = alignTarget(draft);
  return STEPS.map(({ pair, side }) => {
    if (draft[pair][side] !== null) return 'done';
    return target?.pair === pair && target.side === side ? 'active' : 'waiting';
  });
}

export function ringsBounds(rings: readonly Ring[]): RenderBounds | null {
  const points = rings.flat();
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

export function robotRings(scene: VacuumSceneAnswer): Ring[] {
  return vacuumSceneToSourceGeometry(scene).rooms.map((room) => room.ring);
}

export function chosenRobot(
  picked: string | null,
  map: Pick<HomeMap, 'sources'>,
  robots: readonly Pick<RobotCandidate, 'id'>[],
): string | null {
  return picked ?? map.sources[0]?.deviceId ?? robots[0]?.id ?? null;
}

export function useRobotScene(deviceId: string | null): VacuumSceneAnswer | null {
  const query = useScreenQuery({
    queryKey: ['window', 'home-map', 'robot-preview', deviceId ?? ''],
    queryFn: (): Promise<VacuumSceneAnswer> =>
      api().call(E.getVacuumScene, {
        params: { deviceId: deviceId ?? '' },
        query: { slot: 'current' },
      }),
    enabled: deviceId !== null,
  });
  return query.data ?? null;
}

export interface VacuumAlign {
  readonly map: HomeMap;
  readonly mapId: HomeMapId | undefined;
  readonly floorId: string | null;
  readonly readOnly: boolean;
  readonly robots: readonly RobotCandidate[];
  readonly deviceId: string | null;
  readonly choose: (deviceId: string) => void;
  readonly source: HomeMapSource | null;
  readonly robot: readonly Ring[];
  readonly draft: AlignDraft;
  readonly setDraft: (draft: AlignDraft) => void;
}

interface AlignProps {
  readonly align: VacuumAlign;
}

function RobotPicker({ align }: AlignProps): ReactNode {
  if (align.robots.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        No robot vacuum with a map is in the home yet. Draw the rooms by hand instead.
      </Text>
    );
  }
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        1 · Choose the robot
      </Text>
      {align.robots.map((robot) => (
        <ListRow
          key={robot.id}
          title={robot.name}
          icon="vacuum"
          selected={robot.id === align.deviceId}
          onPress={(): void => {
            align.choose(robot.id);
          }}
        />
      ))}
    </View>
  );
}

function PreviewStep({ shown }: { readonly shown: boolean }): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        2 · Check the robot map
      </Text>
      <Text variant="footnote" tone="variant">
        {shown ? PREVIEW_LINE : 'Loading the robot map…'}
      </Text>
    </View>
  );
}

const MARKER: Readonly<Record<StepState, string>> = {
  done: 'bg-primary',
  active: 'border-2 border-primary',
  waiting: 'border border-outline-variant',
};

function StepRow({
  index,
  state,
}: {
  readonly index: number;
  readonly state: StepState;
}): ReactNode {
  const step = STEPS[index];
  if (step === undefined) return null;
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <View className={cn('size-6 items-center justify-center rounded-full', MARKER[state])}>
        {state === 'done' ? (
          <Icon name="check" size={14} tone="onPrimary" />
        ) : (
          <Text variant="footnote" tone={state === 'active' ? 'primary' : 'variant'}>
            {String(index + 1)}
          </Text>
        )}
      </View>
      <Text
        variant={state === 'active' ? 'body-strong' : 'footnote'}
        tone={state === 'waiting' ? 'variant' : 'default'}
        className="min-w-0 flex-1"
      >
        {stepText(step.pair, step.side)}
      </Text>
    </View>
  );
}

function SaveRow({ align, source }: AlignProps & { readonly source: HomeMapSource }): ReactNode {
  const job = useMapJob(align.mapId);
  const points = alignPoints(align.draft);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Save alignment"
          icon="check"
          loading={job.busy}
          disabled={align.readOnly || job.busy || points === null}
          onPress={(): void => {
            if (points === null) return;
            job.start('home_map.align_failed', async () => {
              const answer = await api().call(E.alignHomeMapSource, {
                params: { sourceId: source.id },
                body: { points: [points[0], points[1]] },
                query: { mapId: align.map.id },
              });
              align.setDraft(EMPTY_ALIGN);
              return answer.revision;
            });
          }}
        />
        <Button
          label="Start over"
          variant="text"
          disabled={align.draft === EMPTY_ALIGN}
          onPress={(): void => {
            align.setDraft(EMPTY_ALIGN);
          }}
        />
      </View>
      <JobFailure text={job.failure} />
    </View>
  );
}

function AlignSteps({ align, source }: AlignProps & { readonly source: HomeMapSource }): ReactNode {
  return (
    <View accessibilityLabel={ALIGN_STEPS_LABEL} className="gap-1">
      <Text variant="label" tone="variant">
        4 · Line up with four taps
      </Text>
      <View accessibilityLiveRegion="polite">
        {stepStates(align.draft).map((state, index) => (
          <StepRow key={String(index)} index={index} state={state} />
        ))}
      </View>
      <SaveRow align={align} source={source} />
    </View>
  );
}

function RobotSteps({ align, deviceId }: AlignProps & { readonly deviceId: string }): ReactNode {
  const { source } = align;
  return (
    <>
      <PreviewStep shown={align.robot.length > 0} />
      <ImportStep
        mapId={align.mapId}
        target={align.map.id}
        deviceId={deviceId}
        floorId={source?.floorId ?? align.floorId}
        imported={source !== null}
        readOnly={align.readOnly}
      />
      {source === null ? null : <AlignSteps align={align} source={source} />}
    </>
  );
}

export function VacuumAlignPanel({ align }: AlignProps): ReactNode {
  const { map, mapId, readOnly, deviceId } = align;
  return (
    <View accessibilityLabel={ALIGN_LABEL} className="gap-4">
      <HomeMapNotices
        map={map}
        {...(mapId === undefined ? {} : { mapId })}
        readOnly={readOnly}
        onAlign={(sourceId): void => {
          const held = map.sources.find((entry) => entry.id === sourceId);
          if (held !== undefined) align.choose(held.deviceId);
        }}
      />
      <RobotPicker align={align} />
      {deviceId === null ? null : <RobotSteps align={align} deviceId={deviceId} />}
      <RobotReach />
    </View>
  );
}
