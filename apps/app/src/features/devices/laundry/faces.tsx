import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FrameClass } from '../../../components/widget-board';
import { Button } from '../../../components/button';
import { Glow } from '../../../components/glow';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual, LAUNDRY_GLOW_ROLE, type VisualSize } from '../../device-visuals';
import { Note } from './parts';
import { PhaseStrip, useStageVisual, type StageVisual } from './stage';
import { stripOf } from './strip';
import { Bar } from './tile-bar';
import { programOf } from './draft';
import type { Runner } from './use-runner';
import { useCycles } from './use-cycles';
import { useLaundry, type Laundry } from './use-laundry';
import { useAdvice } from './use-advice';
import { useStarter } from './use-starter';

function glowOf(visual: StageVisual, offline: boolean): keyof typeof LAUNDRY_GLOW_ROLE {
  return offline ? 'rest' : (visual.laundry?.glow ?? 'rest');
}

function FaceVisual({
  visual,
  laundry,
  size,
}: {
  readonly visual: StageVisual;
  readonly laundry: Laundry;
  readonly size: VisualSize;
}): ReactNode {
  const glow = glowOf(visual, laundry.state.offline);
  return (
    <View
      pointerEvents="none"
      className={cn(
        'items-center justify-center overflow-hidden bg-surface-3',
        size === 'tile' ? 'rounded-md' : 'rounded-lg',
      )}
    >
      {glow === 'rest' ? null : <Glow colour={LAUNDRY_GLOW_ROLE[glow]} />}
      <DeviceVisual device={laundry.device} size={size} state={visual} />
    </View>
  );
}

function StartAction({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const starter = useStarter(laundry);
  const { state } = laundry;
  const program = programOf(laundry.snapshot.values);
  if (
    !state.startable ||
    program === undefined ||
    (state.key === 'off' && state.readiness !== null)
  ) {
    return null;
  }
  return (
    <View className="gap-1">
      <Button
        label={state.startLabel}
        icon="play"
        disabled={state.readiness !== null}
        loading={starter.starting}
        onPress={() => {
          starter.send({ program: program.raw, delay: null });
        }}
      />
      {starter.failure === null ? null : (
        <Note icon="alert" tone="critical" text={starter.failure} />
      )}
    </View>
  );
}

function FaceActions({
  laundry,
  runner,
  center = false,
  single = false,
}: {
  readonly laundry: Laundry;
  readonly runner: Runner;
  readonly center?: boolean;
  readonly single?: boolean;
}): ReactNode {
  const { state, actions } = laundry;
  const shown = single ? actions.slice(0, 1) : actions;
  return (
    <View className="gap-1.5">
      <View className={cn('flex-row flex-wrap gap-2', center && 'justify-center')}>
        <StartAction laundry={laundry} />
        {shown.map((entry) => (
          <Button
            key={entry.id}
            label={entry.label}
            variant={entry.look}
            {...(entry.icon === undefined ? {} : { icon: entry.icon })}
            disabled={entry.disabled}
            loading={runner.pending === entry.id}
            onPress={() => {
              runner.run(entry.id);
            }}
          />
        ))}
      </View>
      {state.startable && state.readiness !== null ? <Note text={state.readiness} /> : null}
    </View>
  );
}

function TileFace({ device }: { readonly device: Device }): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  const visual = useStageVisual(laundry, cycles);
  const { state } = laundry;
  return (
    <View className="flex-1 justify-between gap-2" pointerEvents="box-none">
      <View className="flex-row items-start justify-between gap-2" pointerEvents="none">
        <FaceVisual visual={visual} laundry={laundry} size="tile" />
        {state.offline ? <StatusChip status="offline" /> : null}
      </View>
      <View className="gap-0.5" pointerEvents="none">
        <Text variant="body-strong" numberOfLines={2}>
          {device.label}
        </Text>
        <Text variant="footnote" tone={state.tone} numberOfLines={1}>
          {state.short}
        </Text>
        <Bar laundry={laundry} cycles={cycles} />
      </View>
    </View>
  );
}

function CardFace({
  device,
  compact,
}: {
  readonly device: Device;
  readonly compact: boolean;
}): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  const visual = useStageVisual(laundry, cycles);
  const { runner, sheet } = useAdvice(laundry);
  const { state } = laundry;
  const timed = state.running || state.key === 'paused';
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="box-none">
      <FaceVisual visual={visual} laundry={laundry} size="card" />
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <View className="gap-px" pointerEvents="none">
          <Text variant="body-strong" numberOfLines={compact ? 1 : 2}>
            {device.label}
          </Text>
          <Text variant="footnote" tone={state.tone} numberOfLines={compact ? 1 : 2}>
            {state.running && state.left !== null
              ? `${state.word} · ${state.left} left`
              : state.line}
          </Text>
          {timed && state.doneAt !== null ? (
            <Text
              variant="footnote"
              tone="variant"
              className="tabular"
            >{`Done at ${state.doneAt}`}</Text>
          ) : null}
          <Bar laundry={laundry} cycles={cycles} />
        </View>
        <FaceActions laundry={laundry} runner={runner} single={compact} />
      </View>
      {sheet}
    </View>
  );
}

function Supply({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const { values } = laundry.snapshot;
  const low = [
    values.detergent_level === 'Low' ? 'Detergent low' : null,
    values.softener_level === 'Low' ? 'Softener low' : null,
  ].filter((entry): entry is string => entry !== null);
  return low.length === 0 ? null : (
    <View className="flex-row flex-wrap gap-3" pointerEvents="none">
      {low.map((entry) => (
        <View key={entry} className="flex-row items-center gap-1.5">
          <View className="size-2.5 rounded-full bg-caution" />
          <Text variant="caption" tone="variant">
            {entry}
          </Text>
        </View>
      ))}
    </View>
  );
}

function panelFigure(state: Laundry['state']): string {
  if (state.key === 'spin' && state.rpm !== null) {
    return `Spinning · ${String(state.rpm)} rpm`;
  }
  return state.running && state.left !== null ? `${state.left} left` : state.line;
}

function PanelHead({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const room = useRoomName(laundry.device.id);
  const { state } = laundry;
  return (
    <View className="w-full flex-row items-start justify-between gap-2" pointerEvents="none">
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {laundry.device.label}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {[room, state.word].filter((part): part is string => part !== null).join(' · ')}
        </Text>
      </View>
      {state.offline ? <StatusChip status="offline" /> : null}
    </View>
  );
}

function PanelFigure({ state }: { readonly state: Laundry['state'] }): ReactNode {
  const timed = state.running || state.key === 'paused';
  const doneAt = timed ? state.doneAt : null;
  return (
    <View className="items-center" pointerEvents="none">
      <Text
        variant="title-3"
        tone={state.tone === 'primary' ? 'default' : state.tone}
        className="tabular"
      >
        {panelFigure(state)}
      </Text>
      {doneAt !== null ? (
        <Text variant="footnote" tone="variant" className="tabular">
          {`Done at ${doneAt}${state.program === null ? '' : ` · ${state.program}`}`}
        </Text>
      ) : null}
    </View>
  );
}

function PanelFace({ device }: { readonly device: Device }): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  const visual = useStageVisual(laundry, cycles);
  const { runner, sheet } = useAdvice(laundry);
  const { state, snapshot } = laundry;
  const strip = stripOf(snapshot.values, state);
  const colour = useColour(LAUNDRY_GLOW_ROLE[glowOf(visual, state.offline)]);
  const last = cycles.cycles[0];
  return (
    <View className="flex-1 items-center gap-2.5" pointerEvents="box-none">
      <PanelHead laundry={laundry} />
      <FaceVisual visual={visual} laundry={laundry} size="card" />
      <PanelFigure state={state} />
      {strip === null ? null : <PhaseStrip strip={strip} colour={colour} />}
      <FaceActions laundry={laundry} runner={runner} center />
      <Supply laundry={laundry} />
      {last === undefined || state.key === 'finished' ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {`Last cycle: ${last.program}`}
        </Text>
      )}
      {sheet}
    </View>
  );
}

export function LaundryFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: FrameClass;
}): ReactNode {
  switch (cls) {
    case 's':
    case 'xs':
      return <TileFace device={device} />;
    case 'm':
      return <CardFace device={device} compact />;
    case 'w':
      return <CardFace device={device} compact={false} />;
    case 'l':
    case 'xl':
      return <PanelFace device={device} />;
  }
}
