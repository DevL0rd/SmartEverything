import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type {
  VacuumCleanSummary,
  VacuumPoint,
  VacuumPose,
  VacuumScene,
  VacuumTrailRun,
} from '@smarteverything/domain';
import { Badge, type BadgeTone } from '../../../../components/badge';
import { Card } from '../../../../components/card';
import { EmptyState } from '../../../../components/empty-state';
import { ErrorState } from '../../../../components/error-state';
import { IconButton } from '../../../../components/icon-button';
import { Skeleton } from '../../../../components/skeleton';
import { Slider } from '../../../../components/slider';
import { Text } from '../../../../components/text';
import { duration, moment, playTime } from '../../../../format/time';
import { useMinute } from '../../../../store/clock';
import type { Device } from '../../../../store/state';
import { Stage, StageStillView, type StageContent, type StageViewOption } from '../../../home-map';
import { useVacuumClean } from '../data/cleans-query';
import { vacuumFloor, vacuumRenderPose } from '../model/vacuum-scene';
import { Map3dView, type Map3dTrack } from './map-3d-view';
import { describeVacuumMap } from './map-view-model';
import { CLEAN_MODE_LABELS } from '../model/schedule-text';

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  global: 'Whole home',
  zone: 'Zone',
  rooms: 'Rooms',
  edge: 'Edges',
  custom: 'Custom',
  point: 'Spot',
  custom_area: 'Custom area',
  appointment: 'Scheduled',
  linkage: 'Linked',
  fast: 'Quick',
  ai_hosting: 'AI hosting',
};

const MODE_LABELS: Readonly<Record<string, string>> = CLEAN_MODE_LABELS;

interface OutcomeLook {
  readonly label: string;
  readonly tone: BadgeTone;
}

const OUTCOMES: Readonly<Record<string, OutcomeLook>> = {
  finished: { label: 'Finished', tone: 'positive' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  error: { label: 'Error', tone: 'critical' },
  returned_low_battery: { label: 'Low battery', tone: 'warning' },
};

const NAMED_ROOMS = 2;

export function outcomeLook(outcome: string | null): OutcomeLook {
  if (outcome === null) {
    return { label: 'Unknown', tone: 'neutral' };
  }
  return OUTCOMES[outcome] ?? { label: outcome, tone: 'neutral' };
}

export function cleanModeText(mode: string | null): string | null {
  return mode === null ? null : (MODE_LABELS[mode] ?? mode);
}

export function cleanScopeText(clean: Pick<VacuumCleanSummary, 'rooms' | 'scope'>): string {
  const { rooms, scope } = clean;
  if (rooms.length > 0) {
    const named = rooms.slice(0, NAMED_ROOMS).map((room) => room.name);
    const more = rooms.length - named.length;
    return more > 0 ? `${named.join(', ')} +${String(more)}` : named.join(', ');
  }
  return scope === null ? 'Clean' : (SCOPE_LABELS[scope] ?? scope);
}

export interface Replay {
  readonly runs: readonly VacuumTrailRun[];
  readonly head: VacuumPose | null;
}

function lengthBetween(from: VacuumPoint, to: VacuumPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function pathLength(runs: readonly VacuumTrailRun[]): number {
  return runs.reduce(
    (sum, run) =>
      sum +
      run.points.reduce(
        (inner, point, index) =>
          index === 0 ? inner : inner + lengthBetween(run.points[index - 1] ?? point, point),
        0,
      ),
    0,
  );
}

function yawBetween(from: VacuumPoint, to: VacuumPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function runUpTo(
  run: VacuumTrailRun,
  budget: number,
): { readonly run: VacuumTrailRun; readonly left: number; readonly head: VacuumPose | null } {
  const [first, ...rest] = run.points;
  if (first === undefined) {
    return { run, left: budget, head: null };
  }
  const kept: VacuumPoint[] = [first];
  let left = budget;
  let previous = first;
  let head: VacuumPose | null = null;
  for (const point of rest) {
    const segment = lengthBetween(previous, point);
    const yaw = yawBetween(previous, point);
    if (segment > left) {
      const share = left / segment;
      const stop = {
        x: previous.x + (point.x - previous.x) * share,
        y: previous.y + (point.y - previous.y) * share,
      };
      if (left > 0) {
        kept.push(stop);
      }
      return { run: { mopping: run.mopping, points: kept }, left: -1, head: { ...stop, yaw } };
    }
    kept.push(point);
    left -= segment;
    head = { ...point, yaw };
    previous = point;
  }
  return { run: { mopping: run.mopping, points: kept }, left, head };
}

export function replayAt(runs: readonly VacuumTrailRun[], share: number): Replay {
  const clamped = Math.min(1, Math.max(0, share));
  let budget = pathLength(runs) * clamped;
  const shown: VacuumTrailRun[] = [];
  let head: VacuumPose | null = null;
  for (const run of runs) {
    const part = runUpTo(run, budget);
    shown.push(part.run);
    head = part.head ?? head;
    if (part.left < 0) {
      break;
    }
    budget = part.left;
  }
  return { runs: shown, head };
}

export function elapsedAt(clean: Pick<VacuumCleanSummary, 'seconds'>, percent: number): number {
  return Math.round((clean.seconds * Math.min(100, Math.max(0, percent))) / 100);
}

function sceneWithTrail(scene: VacuumScene, runs: readonly VacuumTrailRun[]): VacuumScene {
  return { ...scene, trail: [...runs] };
}

function Facts({ clean }: { readonly clean: VacuumCleanSummary }): ReactNode {
  const now = useMinute();
  const look = outcomeLook(clean.outcome);
  const mode = cleanModeText(clean.mode);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {cleanScopeText(clean)}
          </Text>
          <Text variant="footnote" tone="variant" className="tabular" numberOfLines={2}>
            {[
              moment(clean.startedAt, now),
              `${String(Math.round(clean.areaM2))} m²`,
              duration(clean.seconds),
              ...(mode === null ? [] : [mode]),
            ].join(' · ')}
          </Text>
        </View>
        <Badge label={look.label} tone={look.tone} />
      </View>
    </View>
  );
}

const NO_VIEWS: readonly StageViewOption<'3d'>[] = [];

const NO_ROOMS: readonly number[] = [];

const UNAVAILABLE = { unavailable: true } as const;

const ignore = (): void => undefined;

function ScrubChip({
  clean,
  percent,
  onChange,
}: {
  readonly clean: VacuumCleanSummary;
  readonly percent: number;
  readonly onChange: (percent: number) => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min w-96 max-w-full flex-row items-center gap-3 rounded-full border-hairline border-outline-variant bg-surface-raised px-3">
      <Text variant="caption" className="tabular">
        {playTime(elapsedAt(clean, percent))}
      </Text>
      <View className="min-w-0 flex-1">
        <Slider
          label="Replay position"
          value={percent}
          min={0}
          max={100}
          step={1}
          onChange={onChange}
          onCommit={onChange}
          formatValue={(value) => duration(elapsedAt(clean, value))}
        />
      </View>
      <Text variant="caption" tone="variant" className="tabular">
        {playTime(clean.seconds)}
      </Text>
    </View>
  );
}

function ReplayStill({
  scene,
  replay,
}: {
  readonly scene: VacuumScene;
  readonly replay: Replay;
}): ReactNode {
  return (
    <StageStillView
      input={{
        floor: vacuumFloor(sceneWithTrail(scene, replay.runs)),
        robot: vacuumRenderPose(replay.head),
      }}
      name={scene.name}
      state={UNAVAILABLE}
    />
  );
}

interface ReplayStageProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly replay: Replay;
  readonly label: string;
  readonly scrub: ReactNode;
}

function ReplayStage({ deviceId, scene, replay, label, scrub }: ReplayStageProps): ReactNode {
  const track = useMemo<Map3dTrack>(() => ({ trail: replay.runs, pose: replay.head }), [replay]);
  const content: StageContent = {
    kind: 'direct',
    render: (context) => (
      <Map3dView
        deviceId={deviceId}
        scene={scene}
        turretRaised={0}
        preset="top"
        fitSeq={context.view3d.fitSeq}
        selection={NO_ROOMS}
        currentRoomId={null}
        keepOut={context.chrome}
        insets={context.chromeInsets}
        label={label}
        fallback={<ReplayStill scene={scene} replay={replay} />}
        track={track}
        onPickRoom={ignore}
        onUnavailable={ignore}
      />
    ),
  };
  return (
    <Stage
      content={content}
      views={NO_VIEWS}
      view="3d"
      onViewChange={ignore}
      tools={null}
      notices={scrub}
      summary={label}
    />
  );
}

interface ReplayBodyProps {
  readonly deviceId: string;
  readonly clean: VacuumCleanSummary;
  readonly runs: readonly VacuumTrailRun[];
  readonly mapIndex: number | null;
  readonly scene: VacuumScene | null;
}

function ReplayBody({ deviceId, clean, runs, mapIndex, scene }: ReplayBodyProps): ReactNode {
  const [percent, setPercent] = useState(100);
  const replay = useMemo(() => replayAt(runs, percent / 100), [runs, percent]);
  if (scene === null) {
    return (
      <EmptyState
        compact
        icon="vacuum"
        title="The map is not available"
        body="The path needs the map to be drawn on."
      />
    );
  }
  const earlier = mapIndex !== null && mapIndex !== scene.index;
  const label = `${describeVacuumMap(scene, null, null)}, replay at ${duration(elapsedAt(clean, percent))}`;
  return (
    <View className="gap-3">
      <ReplayStage
        deviceId={deviceId}
        scene={scene}
        replay={replay}
        label={label}
        scrub={<ScrubChip clean={clean} percent={percent} onChange={setPercent} />}
      />
      {earlier ? (
        <Text variant="footnote" tone="variant">
          This clean used an earlier map, so the path is drawn on the current one.
        </Text>
      ) : null}
    </View>
  );
}

export interface CleanReplayProps {
  readonly device: Device;
  readonly clean: VacuumCleanSummary;
  readonly scene: VacuumScene | null;
  readonly onClose: () => void;
}

function Loaded({
  deviceId,
  clean,
  scene,
  full,
}: {
  readonly deviceId: string;
  readonly clean: VacuumCleanSummary;
  readonly scene: VacuumScene | null;
  readonly full: { readonly trail: readonly VacuumTrailRun[]; readonly mapIndex: number | null };
}): ReactNode {
  if (full.trail.every((run) => run.points.length < 2)) {
    return (
      <EmptyState
        compact
        icon="vacuum"
        title="No path was recorded"
        body="This clean has no path to replay."
      />
    );
  }
  return (
    <ReplayBody
      deviceId={deviceId}
      clean={clean}
      runs={full.trail}
      mapIndex={full.mapIndex}
      scene={scene}
    />
  );
}

export function CleanReplay({ device, clean, scene, onClose }: CleanReplayProps): ReactNode {
  const state = useVacuumClean(device.id, clean.id);
  let body: ReactNode;
  if (state.failure !== null) {
    body = <ErrorState error={state.failure} />;
  } else if (state.clean === null) {
    body = <Skeleton shape="block" className="h-50" />;
  } else {
    body = <Loaded deviceId={device.id} clean={clean} scene={scene} full={state.clean} />;
  }
  return (
    <Card
      title="Replay"
      icon="play"
      action={<IconButton icon="close" label="Close replay" onPress={onClose} />}
    >
      <Facts clean={clean} />
      {body}
    </Card>
  );
}
