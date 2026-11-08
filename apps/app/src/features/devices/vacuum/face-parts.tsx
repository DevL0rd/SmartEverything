import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '../../../components/button';
import { EndFade, useEndFade } from '../../../components/end-fade';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useLastSeen } from '../model/last-seen';
import type { Device } from '../../../store/state';
import { BatteryRing } from './components/battery-ring';
import { StationStopButton, stationStopOf } from './components/station-stop';
import { useVacuumActions } from './data/use-vacuum-actions';
import { useVacuumPose } from './data/use-vacuum-pose';
import type { FaceAction, FaceActions, FaceLayout, FaceTile } from './face-model';
import type { FaceFacts } from './face-facts';
import type { StageSlot } from './face-stage';
import { phaseLine } from './model/phase-line';
import { valueOrNull } from './model/readings';
import { roomAt } from './model/room-at';
import type { RoomChip, RoomSelection } from './model/room-selection';

export { AwakeStage, RestStage, StageFrame, type StageSlot } from './face-stage';

export function slotOf(layout: FaceLayout, wide: boolean): StageSlot | null {
  if (layout === 'tile') {
    return null;
  }
  if (layout === 'row') {
    return wide ? 'w' : 'm';
  }
  return layout === 'side' && wide ? 'side' : 'stack';
}

export function PhaseText({
  device,
  facts,
  live,
  strong = false,
}: {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly live: boolean;
  readonly strong?: boolean;
}): ReactNode {
  if (live) {
    return <LivePhase device={device} facts={facts} strong={strong} />;
  }
  return facts.vacuum.snapshot.online ? (
    <PhaseView facts={facts} room={null} lastSeenMs={null} strong={strong} />
  ) : (
    <OfflinePhase device={device} facts={facts} strong={strong} />
  );
}

function OfflinePhase({
  device,
  facts,
  strong,
}: {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly strong: boolean;
}): ReactNode {
  const seen = useLastSeen(device.id)?.at;
  const lastSeenMs = seen === undefined ? null : Date.parse(seen);
  return <PhaseView facts={facts} room={null} lastSeenMs={lastSeenMs} strong={strong} />;
}

function LivePhase({
  device,
  facts,
  strong,
}: {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly strong: boolean;
}): ReactNode {
  const { scene } = facts;
  const pose = valueOrNull(useVacuumPose(device.id)) ?? scene?.robot ?? null;
  const id = scene === null ? null : roomAt(scene.rooms, pose);
  const room = scene?.rooms.find((candidate) => candidate.id === id)?.name ?? null;
  return <PhaseView facts={facts} room={room} lastSeenMs={null} strong={strong} />;
}

function PhaseView({
  facts,
  room,
  lastSeenMs,
  strong,
}: {
  readonly facts: FaceFacts;
  readonly room: string | null;
  readonly lastSeenMs: number | null;
  readonly strong: boolean;
}): ReactNode {
  const { vacuum, chip, job } = facts;
  const text = phaseLine({
    values: vacuum.snapshot.values,
    online: vacuum.snapshot.online,
    lastSeenMs,
    room,
    doneAreaM2: job?.doneAreaM2 ?? null,
    plannedAreaM2: job?.plannedAreaM2 ?? null,
    mapAreaM2: null,
  });
  const critical = chip.tone === 'error';
  return (
    <Text
      variant={strong ? 'body-strong' : 'footnote'}
      tone={critical ? 'critical' : strong ? 'default' : 'variant'}
      numberOfLines={strong ? 1 : 2}
    >
      {text}
    </Text>
  );
}

export function Battery({
  battery,
  size = 'md',
}: {
  readonly battery: number | null;
  readonly size?: 'md' | 'lg';
}): ReactNode {
  return battery === null ? null : <BatteryRing percent={battery} size={size} />;
}

export function Figures({ tiles }: { readonly tiles: readonly FaceTile[] }): ReactNode {
  if (tiles.length === 0) {
    return null;
  }
  return (
    <View className="flex-row gap-2" pointerEvents="none">
      {tiles.map((tile) => (
        <View key={tile.label} className="min-w-0 flex-1 gap-0.5 rounded-md bg-surface-2 px-3 py-2">
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {tile.label}
          </Text>
          <Text variant="body-strong" className="tabular" numberOfLines={1}>
            {tile.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export type ActionLook = 'icon' | 'compact';

function ActionButton({
  action,
  look,
  secondary,
  onPress,
}: {
  readonly action: FaceAction;
  readonly look: ActionLook;
  readonly secondary: boolean;
  readonly onPress: () => void;
}): ReactNode {
  if (look === 'icon') {
    return (
      <IconButton
        icon={action.icon}
        label={action.spoken}
        variant={secondary ? 'tonal' : 'filled'}
        onPress={onPress}
      />
    );
  }
  return (
    <Button
      label={action.label}
      hint={action.spoken}
      icon={action.icon}
      variant={secondary ? 'tonal' : 'filled'}
      onPress={onPress}
    />
  );
}

interface RowProps {
  readonly device: Device;
  readonly actions: FaceActions;
  readonly selection: RoomSelection;
}

function useRun(props: RowProps): (action: FaceAction) => void {
  const vacuum = useVacuumActions(props.device);
  return (action): void => {
    if (action.id === 'start' && props.actions.cleanRooms) {
      vacuum.cleanRooms(props.selection);
    } else {
      vacuum.command(action.command);
    }
  };
}

function RowActions(props: RowProps & { readonly look: ActionLook }): ReactNode {
  const run = useRun(props);
  const { primary, dock } = props.actions;
  const shown = [
    ...(primary === null ? [] : [{ action: primary, secondary: false }]),
    ...(dock === null ? [] : [{ action: dock, secondary: true }]),
  ];
  return shown.map(({ action, secondary }) => (
    <ActionButton
      key={action.id}
      action={action}
      look={props.look}
      secondary={secondary}
      onPress={(): void => {
        run(action);
      }}
    />
  ));
}

export interface FaceRowProps extends RowProps {
  readonly facts: FaceFacts;
}

export function ActionRow({
  facts,
  look,
  ...row
}: FaceRowProps & { readonly look: ActionLook }): ReactNode {
  const stop = stationStopOf(facts.vacuum.presentation, facts.vacuum.snapshot.values);
  return stop === null || look === 'icon' ? (
    <RowActions {...row} look={look} />
  ) : (
    <StationStopButton device={row.device} stop={stop} />
  );
}

const CHIP_FRAME = 'min-h-touch-min flex-row items-center gap-1.5 rounded-full border px-3';

function ChipText({ chip }: { readonly chip: RoomChip }): ReactNode {
  return (
    <>
      {chip.order === null ? null : (
        <Text variant="caption" tone="primary" className="tabular">
          {String(chip.order)}
        </Text>
      )}
      <Text variant="footnote" numberOfLines={1}>
        {chip.name}
      </Text>
      {chip.now ? <View className="size-1.5 rounded-full bg-positive" /> : null}
    </>
  );
}

function RoomChip({
  chip,
  onPick,
}: {
  readonly chip: RoomChip;
  readonly onPick: ((id: number) => void) | undefined;
}): ReactNode {
  if (onPick === undefined) {
    return (
      <View
        accessible
        accessibilityLabel={chip.label}
        className={cn(CHIP_FRAME, 'border-outline-variant')}
      >
        <ChipText chip={chip} />
      </View>
    );
  }
  return (
    <Interactive
      label={chip.label}
      selected={chip.selected}
      role="button"
      onPress={() => {
        onPick(chip.id);
      }}
      className={cn(
        CHIP_FRAME,
        chip.selected ? 'border-primary bg-primary-container' : 'border-outline',
      )}
    >
      <ChipText chip={chip} />
    </Interactive>
  );
}

export function RoomChips({
  chips,
  onPick,
}: {
  readonly chips: readonly RoomChip[];
  readonly onPick: ((id: number) => void) | undefined;
}): ReactNode {
  const [viewport, setViewport] = useState(0);
  const fade = useEndFade(viewport);
  if (chips.length === 0) {
    return null;
  }
  return (
    <View className="flex-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          setViewport(event.nativeEvent.layout.width);
        }}
        {...fade.scroll}
        contentContainerClassName="items-center gap-2"
        accessibilityLabel={onPick === undefined ? 'Rooms on the map' : 'Rooms to clean'}
      >
        {chips.map((chip) => (
          <RoomChip key={chip.id} chip={chip} onPick={onPick} />
        ))}
      </ScrollView>
      {fade.shown ? <EndFade surface="card" /> : null}
    </View>
  );
}

export function RestNotes({
  detail,
  lines = 1,
}: {
  readonly detail: string | null;
  readonly lines?: 1 | 2;
}): ReactNode {
  return detail === null ? null : (
    <Text variant="caption" tone="variant" numberOfLines={lines} className="tabular">
      {detail}
    </Text>
  );
}
