import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { VacuumScene } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import type { Tone } from '../../../../components/tone';
import {
  visibilityRegistry,
  type VisibilityRegistry,
} from '../../../../components/house-map/live-visibility/registry';
import { cn } from '../../../../design/cn';
import { StageStillView } from '../../../home-map';
import { useVacuumMapDemand } from '../data/map-demand';
import { useVacuumPose } from '../data/use-vacuum-pose';
import { valueOrNull } from '../model/readings';
import { houseRobotPose, type UnifiedMap } from '../model/unified-map';
import { vacuumFloor, vacuumRenderPose } from '../model/vacuum-scene';
import type { CardBody, StageNote, StageNoteAction, StageNoteTone } from './map-view-model';

const NOTE_TONE: Readonly<Record<StageNoteTone, Tone>> = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
  neutral: 'variant',
};

const ACTION_LABEL: Readonly<Record<StageNoteAction, string>> = {
  retry: 'Try again',
};

export interface NoteHandlers {
  readonly onRetry: (() => void) | undefined;
}

function NoteAction({
  action,
  handlers,
}: {
  readonly action: StageNoteAction;
  readonly handlers: NoteHandlers;
}): ReactNode {
  const onPress = handlers.onRetry;
  if (onPress === undefined) {
    return null;
  }
  return (
    <Interactive
      role="button"
      label={ACTION_LABEL[action]}
      onPress={onPress}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full px-3"
    >
      <Text variant="label" tone="primary">
        {ACTION_LABEL[action]}
      </Text>
    </Interactive>
  );
}

function MoreToggle({
  open,
  onToggle,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      role="button"
      label={open ? 'Show less' : 'Show what to do'}
      onPress={onToggle}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full px-3"
    >
      <Text variant="label" tone="primary">
        {open ? 'Less' : 'More'}
      </Text>
    </Interactive>
  );
}

function Note({
  note,
  handlers,
}: {
  readonly note: StageNote;
  readonly handlers: NoteHandlers;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View
      accessibilityRole={note.tone === 'critical' ? 'alert' : 'summary'}
      className={cn(
        'flex-row items-center gap-2 rounded-lg bg-surface-raised py-1 pl-3 pr-1',
        note.tone === 'critical'
          ? 'self-stretch border border-critical'
          : 'self-start border-hairline border-outline-variant',
      )}
    >
      <Icon name={note.icon} size={16} tone={NOTE_TONE[note.tone]} />
      <View className="min-w-0 shrink py-1">
        <Text
          variant="caption"
          tone={note.tone === 'critical' ? 'critical' : 'default'}
          {...(open ? {} : { numberOfLines: 2 })}
        >
          {note.text}
        </Text>
        {note.detail === null || !open ? null : (
          <Text variant="caption" tone="variant">
            {note.detail}
          </Text>
        )}
      </View>
      {note.detail === null ? null : (
        <MoreToggle
          open={open}
          onToggle={() => {
            setOpen(!open);
          }}
        />
      )}
      {note.action === null ? null : <NoteAction action={note.action} handlers={handlers} />}
    </View>
  );
}

export function NoteStack({
  notes,
  handlers,
  onLayout,
}: {
  readonly notes: readonly StageNote[];
  readonly handlers: NoteHandlers;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}): ReactNode {
  if (notes.length === 0) {
    return null;
  }
  return (
    <View pointerEvents="box-none" onLayout={onLayout} className="min-w-48 shrink gap-1">
      {notes.map((note) => (
        <Note key={note.id} note={note} handlers={handlers} />
      ))}
    </View>
  );
}

export interface CardHandlers {
  readonly onMapHome: (() => void) | undefined;
  readonly mapHomeDisabled: boolean;
  readonly onRetry: (() => void) | undefined;
}

function EmptyCard({ handlers }: { readonly handlers: CardHandlers }): ReactNode {
  return (
    <EmptyState
      compact
      icon="route"
      title="No map yet"
      body="The robot maps your home on its first run. About 15 minutes for five rooms."
      action={
        handlers.onMapHome === undefined ? undefined : (
          <Button
            label="Run a quick mapping"
            icon="route"
            size="lg"
            disabled={handlers.mapHomeDisabled}
            onPress={handlers.onMapHome}
          />
        )
      }
    />
  );
}

function UnreadableCard({ handlers }: { readonly handlers: CardHandlers }): ReactNode {
  return (
    <EmptyState
      compact
      icon="warning"
      title="The map couldn't be read"
      body="The robot is fine. The map will show again once it can be read."
      action={
        handlers.onRetry === undefined ? undefined : (
          <Button label="Try again" variant="tonal" size="lg" onPress={handlers.onRetry} />
        )
      }
    />
  );
}

function CompactCard({ body }: { readonly body: Exclude<CardBody, 'loading'> }): ReactNode {
  return (
    <View className="flex-1 items-center justify-center gap-1 px-3">
      <Icon name={body === 'empty' ? 'route' : 'warning'} size={20} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {body === 'empty' ? 'No map yet' : "Map couldn't be read"}
      </Text>
    </View>
  );
}

export function StateCard({
  body,
  handlers,
  compact,
}: {
  readonly body: CardBody;
  readonly handlers: CardHandlers;
  readonly compact: boolean;
}): ReactNode {
  if (body === 'loading') {
    return (
      <View accessibilityLabel="Loading the map" accessibilityRole="progressbar" className="flex-1">
        <Skeleton shape="tile" className="h-full rounded-none" />
      </View>
    );
  }
  if (compact) {
    return <CompactCard body={body} />;
  }
  return (
    <View className="flex-1 items-center justify-center px-4 pb-16 pt-14">
      {body === 'empty' ? (
        <EmptyCard handlers={handlers} />
      ) : (
        <UnreadableCard handlers={handlers} />
      )}
    </View>
  );
}

const NOT_UNAVAILABLE = { unavailable: false } as const;

export interface VacuumStillProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly unified: UnifiedMap | null;
}

export function VacuumStill({ deviceId, scene, unified }: VacuumStillProps): ReactNode {
  const pose = valueOrNull(useVacuumPose(deviceId)) ?? scene.robot;
  if (unified !== null) {
    return (
      <StageStillView
        input={{ floor: unified.floor, robot: houseRobotPose(unified.transform, pose) }}
        name={unified.place.floor.name}
        state={NOT_UNAVAILABLE}
      />
    );
  }
  return (
    <StageStillView
      input={{ floor: vacuumFloor(scene), robot: vacuumRenderPose(pose) }}
      name={scene.name}
      state={NOT_UNAVAILABLE}
    />
  );
}

const NOTHING_TO_RELEASE = (): void => undefined;

export function useStageLive(
  stageId: string | null,
  registry: VisibilityRegistry = visibilityRegistry,
): boolean {
  const subscribe = useCallback(
    (listener: () => void): (() => void) =>
      stageId === null ? NOTHING_TO_RELEASE : registry.subscribeStage(stageId, listener),
    [registry, stageId],
  );
  const read = useCallback(
    (): boolean => stageId !== null && registry.getStage(stageId).live,
    [registry, stageId],
  );
  return useSyncExternalStore(subscribe, read, read);
}

export interface VacuumRouteGate {
  readonly stageId: string | null;
  readonly onScreen: boolean;
  readonly registry?: VisibilityRegistry;
}

export function useVacuumRoute(deviceId: string, gate: VacuumRouteGate): boolean {
  const stageLive = useStageLive(gate.stageId, gate.registry);
  const held = gate.stageId === null ? gate.onScreen : stageLive;
  useVacuumMapDemand(deviceId, held);
  return held;
}
