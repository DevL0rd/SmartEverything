import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FrameClass } from '../../../components/widget-board';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { ActionBand } from '../../../components/widget-board/action-band';
import { Glow } from '../../../components/glow';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import {
  DeviceVisual,
  LAUNDRY_GLOW_ROLE,
  SIZE_CLASS,
  type VisualPx,
  type VisualSize,
} from '../../device-visuals';
import { WIDE_VISUAL_PX, WideArt } from '../card/wide-card';
import type { LaundryAction } from './actions';
import { Note } from './parts';
import { PhaseStrip, useStageVisual, type StageVisual } from './stage';
import { stripOf } from './strip';
import { Bar } from './tile-bar';
import { programOf } from './draft';
import type { Runner } from './use-runner';
import { useCycles } from './use-cycles';
import { useLaundry, type Laundry } from './use-laundry';
import { useAdvice } from './use-advice';
import { useStarter, type Starter } from './use-starter';

function glowOf(visual: StageVisual, offline: boolean): keyof typeof LAUNDRY_GLOW_ROLE {
  return offline ? 'rest' : (visual.laundry?.glow ?? 'rest');
}

function FaceVisual({
  visual,
  laundry,
  size,
  px,
}: {
  readonly visual: StageVisual;
  readonly laundry: Laundry;
  readonly size: VisualSize;
  readonly px?: VisualPx;
}): ReactNode {
  const glow = glowOf(visual, laundry.state.offline);
  return (
    <View
      pointerEvents="none"
      className={cn(
        'shrink-0 items-center justify-center self-start overflow-hidden bg-surface-3',
        size === 'tile' ? 'rounded-md' : 'rounded-lg',
        px === undefined ? null : SIZE_CLASS[px],
      )}
    >
      {glow === 'rest' ? null : <Glow colour={LAUNDRY_GLOW_ROLE[glow]} />}
      <DeviceVisual
        device={laundry.device}
        size={size}
        state={visual}
        {...(px === undefined ? {} : { px })}
      />
    </View>
  );
}

function startOffered(laundry: Laundry): boolean {
  const { state } = laundry;
  return (
    state.startable &&
    programOf(laundry.snapshot.values) !== undefined &&
    !(state.key === 'off' && state.readiness !== null)
  );
}

function StartAction({
  laundry,
  starter,
  iconOnly,
}: {
  readonly laundry: Laundry;
  readonly starter: Starter;
  readonly iconOnly: boolean;
}): ReactNode {
  const { state } = laundry;
  const program = programOf(laundry.snapshot.values);
  if (!startOffered(laundry) || program === undefined) {
    return null;
  }
  const press = (): void => {
    starter.send({ program: program.raw, delay: null });
  };
  const disabled = state.readiness !== null || starter.starting;
  return iconOnly ? (
    <IconButton
      icon="play"
      label={state.startLabel}
      variant="filled"
      disabled={disabled}
      onPress={press}
    />
  ) : (
    <Button
      label={state.startLabel}
      icon="play"
      disabled={state.readiness !== null}
      loading={starter.starting}
      onPress={press}
    />
  );
}

function ActionButton({
  entry,
  runner,
  iconOnly,
}: {
  readonly entry: LaundryAction;
  readonly runner: Runner;
  readonly iconOnly: boolean;
}): ReactNode {
  const press = (): void => {
    runner.run(entry.id);
  };
  const opener = entry.id === 'advice' ? { ref: runner.adviceOpener } : {};
  if (iconOnly && entry.icon !== undefined) {
    return (
      <IconButton
        {...opener}
        icon={entry.icon}
        label={entry.label}
        variant={entry.look === 'outlined' ? 'standard' : entry.look}
        disabled={entry.disabled || runner.pending === entry.id}
        onPress={press}
      />
    );
  }
  return (
    <Button
      {...opener}
      label={entry.label}
      variant={entry.look}
      {...(entry.icon === undefined ? {} : { icon: entry.icon })}
      disabled={entry.disabled}
      loading={runner.pending === entry.id}
      onPress={press}
    />
  );
}

interface BandProps {
  readonly laundry: Laundry;
  readonly runner: Runner;
  readonly starter: Starter;
  readonly iconOnly: boolean;
}

function FaceBand({ laundry, runner, starter, iconOnly }: BandProps): ReactNode {
  return (
    <ActionBand>
      {startOffered(laundry) ? (
        <StartAction key="start" laundry={laundry} starter={starter} iconOnly={iconOnly} />
      ) : null}
      {laundry.actions.map((entry) => (
        <ActionButton key={entry.id} entry={entry} runner={runner} iconOnly={iconOnly} />
      ))}
    </ActionBand>
  );
}

function FaceNotes({
  laundry,
  starter,
}: {
  readonly laundry: Laundry;
  readonly starter: Starter;
}): ReactNode {
  const { state } = laundry;
  return (
    <>
      {starter.failure === null ? null : (
        <Note icon="alert" tone="critical" text={starter.failure} />
      )}
      {state.startable && state.readiness !== null ? <Note text={state.readiness} /> : null}
    </>
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
      <ActionBand />
    </View>
  );
}

function CardInfo({
  laundry,
  compact,
  children,
}: {
  readonly laundry: Laundry;
  readonly compact: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { state } = laundry;
  const timed = state.running || state.key === 'paused';
  return (
    <View className="gap-px" pointerEvents="none">
      <Text variant="body-strong" numberOfLines={compact ? 1 : 2}>
        {laundry.device.label}
      </Text>
      <Text variant="footnote" tone={state.tone} numberOfLines={compact ? 1 : 2}>
        {state.running && state.left !== null ? `${state.word} · ${state.left} left` : state.line}
      </Text>
      {timed && state.doneAt !== null ? (
        <Text
          variant="footnote"
          tone="variant"
          className="tabular"
        >{`Done at ${state.doneAt}`}</Text>
      ) : null}
      {children}
    </View>
  );
}

function CardFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: 'm' | 'w';
}): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  const visual = useStageVisual(laundry, cycles);
  const { runner, sheet } = useAdvice(laundry);
  const starter = useStarter(laundry);
  const compact = cls === 'm';
  return (
    <View className={cn('flex-1 flex-row', compact ? 'gap-3' : 'gap-4')} pointerEvents="box-none">
      <WideArt cls={cls}>
        <FaceVisual visual={visual} laundry={laundry} size="card" px={WIDE_VISUAL_PX[cls]} />
      </WideArt>
      <View className="min-w-0 flex-1 gap-1.5" pointerEvents="box-none">
        <CardInfo laundry={laundry} compact={compact}>
          <Bar laundry={laundry} cycles={cycles} />
        </CardInfo>
        <FaceNotes laundry={laundry} starter={starter} />
        <FaceBand laundry={laundry} runner={runner} starter={starter} iconOnly={compact} />
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
    <View className="flex-row items-start justify-between gap-2" pointerEvents="none">
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={2}>
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
    <View className="min-w-0" pointerEvents="none">
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
  const starter = useStarter(laundry);
  const { state, snapshot } = laundry;
  const strip = stripOf(snapshot.values, state);
  const colour = useColour(LAUNDRY_GLOW_ROLE[glowOf(visual, state.offline)]);
  const last = cycles.cycles[0];
  return (
    <View className="flex-1 flex-row gap-4" pointerEvents="box-none">
      <WideArt cls="xl">
        <FaceVisual visual={visual} laundry={laundry} size="card" px={WIDE_VISUAL_PX.xl} />
      </WideArt>
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <PanelHead laundry={laundry} />
        <PanelFigure state={state} />
        {strip === null ? null : <PhaseStrip strip={strip} colour={colour} start />}
        <Supply laundry={laundry} />
        {last === undefined || state.key === 'finished' ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {`Last cycle: ${last.program}`}
          </Text>
        )}
        <FaceNotes laundry={laundry} starter={starter} />
        <FaceBand laundry={laundry} runner={runner} starter={starter} iconOnly={false} />
      </View>
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
    case 'w':
      return <CardFace device={device} cls={cls} />;
    case 'l':
    case 'xl':
      return <PanelFace device={device} />;
  }
}
