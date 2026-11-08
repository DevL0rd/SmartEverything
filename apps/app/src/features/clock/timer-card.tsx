import type { PlannerRingTarget, PlannerTimerRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { css, useDerivedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { PlannerTimerAction } from '../../api/planner';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { DrawnStroke } from '../../components/charts/arc';
import { arcLength, arcPath } from '../../components/charts/geometry';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { notifyFailure } from '../../components/toast-store';
import { useAnimationGate } from '../../design/animation-gate';
import { cn } from '../../design/cn';
import { useColour } from '../../design/colour';
import { loopStyle } from '../../design/loops';
import type { ColourRole } from '../../design/tokens';
import { useVisibleLive } from '../../design/use-visible-live';
import { useScopeVisible } from '../../design/visibility';
import { MINUTE_MS, clock } from '../../format/time';
import { useDevice, useRow } from '../../store/selectors';
import { usePlannerClockWrites } from '../planner/data';
import { useHubOffline } from './frame/hub-status';
import { lengthText, timerNameOf, timerSourceOf, type TimerView } from './lap-model';
import { TickingTime, useTickingMs, type FaceSize } from './stopwatch-face';

const PULSE = css.keyframes({
  from: { opacity: 0.9, transform: [{ scale: 1 }] },
  to: { opacity: 0, transform: [{ scale: 1.03 }] },
});

const PULSE_MS = 1400;

export interface TimerActions {
  readonly offline: boolean;
  readonly act: (action: PlannerTimerAction) => void;
  readonly addMinute: () => void;
}

const FAILED: Readonly<Record<PlannerTimerAction, string>> = {
  pause: 'Couldn’t pause the timer',
  resume: 'Couldn’t resume the timer',
  cancel: 'Couldn’t stop the timer',
};

export function useTimerActions(timer: PlannerTimerRow): TimerActions {
  const writes = usePlannerClockWrites(null);
  return {
    offline: useHubOffline(),
    act: (action): void => {
      background(
        writes.actOnTimer(timer.id, action).catch(notifyFailure(FAILED[action])),
        'clock.timer_action_failed',
      );
    },
    addMinute: (): void => {
      background(
        writes.addTimerTime(timer.id, MINUTE_MS).catch(notifyFailure('Couldn’t add a minute')),
        'clock.timer_add_failed',
      );
    },
  };
}

export function timerEndOf(view: TimerView): string {
  if (view.phase === 'running' && view.timer.ends_at !== null) {
    return `ends ${clock(view.timer.ends_at)}`;
  }
  if (view.phase === 'paused') return `paused at ${clock(view.timer.updated_at)}`;
  return `ended ${clock(view.ring?.rang_at ?? view.ring?.due_at ?? view.timer.updated_at)}`;
}

export function timerLineOf(view: TimerView): string {
  return `${lengthText(view.timer.duration_ms)} · ${timerEndOf(view)}`;
}

export function timerLabelOf(view: TimerView): string {
  const name = timerNameOf(view.timer);
  if (view.phase === 'ringing') return `${name} timer finished`;
  return `${name}, ${timerLineOf(view)}`;
}

const DIAL_COLOUR: Readonly<Record<TimerView['phase'], ColourRole>> = {
  ringing: 'primary',
  running: 'primary',
  paused: 'on-surface-variant',
};

export type DialSize = 'row' | 'card' | 'hero';

const DIAL: Readonly<
  Record<
    DialSize,
    {
      readonly px: number;
      readonly thickness: number;
      readonly frame: string;
      readonly digits: FaceSize;
    }
  >
> = {
  row: { px: 56, thickness: 4, frame: 'size-14', digits: 'footnote' },
  card: { px: 116, thickness: 8, frame: 'size-29', digits: 's' },
  hero: { px: 220, thickness: 10, frame: 'size-55', digits: 'l' },
};

export interface TimerDialProps {
  readonly view: TimerView;
  readonly size: DialSize;
  readonly caption?: string;
}

export function TimerDial({ view, size: dial, caption }: TimerDialProps): ReactNode {
  const { px: size, thickness, frame, digits } = DIAL[dial];
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const source = timerSourceOf(view.timer);
  const ms = useTickingMs(source, live);
  const total = view.timer.duration_ms;
  const ringing = view.phase === 'ringing';
  const share = useDerivedValue(() => (ringing ? 1 : Math.min(1, ms.get() / total)));
  const stroke = useColour(DIAL_COLOUR[view.phase]);
  const track = useColour('surface-3');
  const ring = { cx: size / 2, cy: size / 2, r: (size - thickness) / 2 };
  const d = arcPath(ring, 0, 360);
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={timerLabelOf(view)}
      className={cn('items-center justify-center', frame)}
    >
      <Svg width={size} height={size} aria-hidden style={StyleSheet.absoluteFill}>
        <Path d={d} fill="none" stroke={track} strokeWidth={thickness} />
        <DrawnStroke
          d={d}
          length={arcLength(ring.r, 360)}
          shades={[{ through: Number.POSITIVE_INFINITY, colour: stroke }]}
          thickness={thickness}
          drawn={share}
        />
      </Svg>
      <TickingTime source={source} live={live} size={digits} ms={ms} />
      {caption === undefined ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {caption}
        </Text>
      )}
    </View>
  );
}

function ClientChip({ id }: { readonly id: string }): ReactNode {
  const client = useRow('clients', id);
  if (client === null) return null;
  return <Badge label={client.name} icon={client.kind === 'phone' ? 'smartphone' : 'monitor'} />;
}

function DeviceChip({ id }: { readonly id: string }): ReactNode {
  const device = useDevice(id);
  if (device === null) return null;
  return <Badge label={device.name} icon="speaker" />;
}

export function TargetChips({
  targets,
}: {
  readonly targets: readonly PlannerRingTarget[];
}): ReactNode {
  if (targets.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-1">
      {targets.map((target) =>
        target.kind === 'client' ? (
          <ClientChip key={target.clientId} id={target.clientId} />
        ) : (
          <DeviceChip key={target.deviceId} id={target.deviceId} />
        ),
      )}
    </View>
  );
}

export function RingPulse({ ringing }: { readonly ringing: boolean }): ReactNode {
  const { moving } = useAnimationGate(ringing, useScopeVisible());
  if (!ringing) return null;
  return (
    <>
      <View
        pointerEvents="none"
        className="absolute -inset-px rounded-lg border-2 border-primary"
      />
      <Animated.View
        pointerEvents="none"
        style={loopStyle({ name: PULSE, ms: PULSE_MS, easing: 'ease-out' }, moving)}
        className="absolute -inset-px rounded-lg border-4 border-primary/40"
      />
    </>
  );
}

function RingingActions({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act, addMinute } = useTimerActions(view.timer);
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Button
        label="Dismiss"
        variant="filled"
        disabled={offline}
        onPress={() => {
          act('cancel');
        }}
      />
      <Button
        label="+1 min"
        spoken="Add one minute"
        variant="outlined"
        disabled={offline}
        onPress={addMinute}
      />
    </View>
  );
}

function LiveActions({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act, addMinute } = useTimerActions(view.timer);
  const running = view.phase === 'running';
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <IconButton
        icon={running ? 'pause' : 'play'}
        label={running ? 'Pause' : 'Resume'}
        variant={running ? 'tonal' : 'filled'}
        disabled={offline}
        onPress={() => {
          act(running ? 'pause' : 'resume');
        }}
      />
      {running ? (
        <Button
          label="+1 min"
          spoken="Add one minute"
          variant="outlined"
          disabled={offline}
          onPress={addMinute}
        />
      ) : null}
      <IconButton
        icon="close"
        label="Cancel timer"
        disabled={offline}
        onPress={() => {
          act('cancel');
        }}
      />
    </View>
  );
}

function CardTitle({ view }: { readonly view: TimerView }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="title-3" numberOfLines={1} className="min-w-0 shrink">
        {timerNameOf(view.timer)}
      </Text>
      {view.phase === 'paused' ? <Badge label="Paused" /> : null}
    </View>
  );
}

export function TimerCard({ view }: { readonly view: TimerView }): ReactNode {
  const ringing = view.phase === 'ringing';
  return (
    <View className="relative">
      <Card>
        <View className="flex-row items-center gap-4">
          <TimerDial view={view} size="card" />
          <View className="min-w-0 flex-1 gap-2">
            {ringing ? <Badge label="Ringing" tone="primary" icon="bell" /> : null}
            <CardTitle view={view} />
            <Text variant="caption" tone="variant" numberOfLines={2} className="tabular">
              {timerLineOf(view)}
            </Text>
            {view.phase === 'running' ? <TargetChips targets={view.timer.targets} /> : null}
            {ringing ? <RingingActions view={view} /> : <LiveActions view={view} />}
          </View>
        </View>
      </Card>
      <RingPulse ringing={ringing} />
    </View>
  );
}
