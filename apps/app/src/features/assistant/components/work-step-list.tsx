import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { css, cubicBezier } from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useAnimationGate } from '../../../design/animation-gate';
import { DURATION, useMotion } from '../../../design/motion';
import { useScopeVisible } from '../../../design/visibility';
import { SPIN, loopStyle } from '../../../design/loops';
import { playTime } from '../../../format/time';
import { activityExpanded } from '../model/chat-display';
import type { StepState, WorkStep } from '../model/work-steps';
import { Rise } from './rise';
import { RISE_MS, RISE_PX } from './thread-motion';

export type ActivityGlyph =
  'running' | 'done' | 'failed' | 'partial' | 'stopped' | 'unknown' | 'thought' | 'retried';

const GLYPHS: Readonly<
  Record<Exclude<ActivityGlyph, 'running'>, { readonly icon: IconName; readonly tone: Tone }>
> = {
  done: { icon: 'check', tone: 'positive' },
  failed: { icon: 'x', tone: 'critical' },
  partial: { icon: 'alert', tone: 'warning' },
  stopped: { icon: 'square', tone: 'variant' },
  unknown: { icon: 'circle', tone: 'warning' },
  thought: { icon: 'bulb', tone: 'variant' },
  retried: { icon: 'refresh', tone: 'variant' },
};

const SHIMMER = css.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.6 },
  '100%': { opacity: 1 },
});

const SHIMMER_MS = 1800;

const remembered = new Map<string, boolean>();

export function rememberActivityOpen(key: string, open: boolean): void {
  remembered.set(key, open);
}

export function useActivityOpen(key: string, live: boolean): readonly [boolean, () => void] {
  const [chosen, setChosen] = useState(() => remembered.get(key));
  const open = chosen ?? activityExpanded(live);
  const toggle = (): void => {
    rememberActivityOpen(key, !open);
    setChosen(!open);
  };
  return [open, toggle];
}

export function elapsedLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return whole < 60 ? `${String(whole)} s` : playTime(whole);
}

export function Spinner({ tone = 'primary' }: { readonly tone?: Tone }): ReactNode {
  const { moving } = useAnimationGate(true, useScopeVisible());
  return (
    <Animated.View style={loopStyle({ name: SPIN, ms: 900 }, moving)}>
      <Icon name="loader" size={16} tone={tone} />
    </Animated.View>
  );
}

export function GlyphMark({ glyph }: { readonly glyph: ActivityGlyph }): ReactNode {
  if (glyph === 'running') return <Spinner />;
  const { icon, tone } = GLYPHS[glyph];
  return <Icon name={icon} size={16} tone={tone} />;
}

const CHEVRON_EASING = cubicBezier(0.2, 0, 0, 1);

const CHEVRON_TURN = {
  transitionProperty: 'transform',
  transitionDuration: DURATION.mediumOut,
  transitionTimingFunction: CHEVRON_EASING,
} as const;

const CHEVRON = {
  closed: { transform: [{ rotate: '0deg' }] },
  open: { transform: [{ rotate: '90deg' }] },
  closedTurning: { transform: [{ rotate: '0deg' }], ...CHEVRON_TURN },
  openTurning: { transform: [{ rotate: '90deg' }], ...CHEVRON_TURN },
} as const;

function chevronStyle(open: boolean, reduced: boolean): (typeof CHEVRON)[keyof typeof CHEVRON] {
  if (reduced) return open ? CHEVRON.open : CHEVRON.closed;
  return open ? CHEVRON.openTurning : CHEVRON.closedTurning;
}

function LineChevron({ open }: { readonly open: boolean }): ReactNode {
  const { reduced } = useMotion();
  return (
    <Animated.View style={chevronStyle(open, reduced)}>
      <Icon name="chevronRight" size={16} tone="faint" />
    </Animated.View>
  );
}

export interface ActivityLineText {
  readonly glyph: ActivityGlyph;
  readonly lead: string;
  readonly notes: readonly string[];
  readonly verbs: readonly string[];
  readonly label: string;
}

export interface LinePiece {
  readonly text: string;
  readonly spaced: boolean;
}

export function linePieces(text: ActivityLineText): readonly LinePiece[] {
  return [
    ...text.notes.map((note) => ({ text: `· ${note}`, spaced: true })),
    ...text.verbs.map((verb, index) =>
      index === 0 ? { text: `· ${verb}`, spaced: true } : { text: `, ${verb}`, spaced: false },
    ),
  ];
}

function Summary({
  text,
  shimmer,
}: {
  readonly text: ActivityLineText;
  readonly shimmer: boolean;
}): ReactNode {
  const { moving } = useAnimationGate(shimmer, useScopeVisible());
  return (
    <Animated.View
      style={loopStyle({ name: SHIMMER, ms: SHIMMER_MS }, moving)}
      className="h-4.5 min-w-0 shrink flex-row flex-wrap overflow-hidden"
    >
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
        {text.lead}
      </Text>
      {linePieces(text).map((piece) => (
        <Text
          key={piece.text}
          variant="footnote"
          tone="variant"
          numberOfLines={1}
          className={cn('shrink-0', piece.spaced && 'ml-1')}
        >
          {piece.text}
        </Text>
      ))}
    </Animated.View>
  );
}

export function ActivityLine({
  text,
  duration,
  live,
  open,
  onToggle,
}: {
  readonly text: ActivityLineText;
  readonly duration: string | null;
  readonly live: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      label={duration === null ? text.label : `${text.label}, ${duration}`}
      expanded={open}
      hint={open ? 'Hide steps' : 'Show steps'}
      hitSlop={10}
      onPress={onToggle}
      className="h-5.5 max-w-full flex-row items-center gap-2 self-start rounded-sm"
      layerClassName="-mx-1 rounded-sm"
    >
      <GlyphMark glyph={text.glyph} />
      <Summary text={text} shimmer={live} />
      {duration === null ? null : (
        <Text variant="footnote" tone="faint" className="shrink-0 tabular">
          {duration}
        </Text>
      )}
      <LineChevron open={open} />
    </Interactive>
  );
}

export function WaitingLine({
  text,
  duration,
}: {
  readonly text: ActivityLineText;
  readonly duration: string | null;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={duration === null ? text.label : `${text.label}, ${duration}`}
      className="h-5.5 max-w-full flex-row items-center gap-2 self-start"
    >
      <GlyphMark glyph="running" />
      <Summary text={text} shimmer />
      {duration === null ? null : (
        <Text variant="footnote" tone="faint" className="shrink-0 tabular">
          {duration}
        </Text>
      )}
    </View>
  );
}

export function ActivityRows({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="relative min-w-0 py-0.5">
      <View aria-hidden className="absolute bottom-3 left-1.75 top-3 w-px bg-outline" />
      {children}
    </View>
  );
}

interface RowToggle {
  readonly open: boolean;
  readonly onPress: () => void;
  readonly hint: string;
}

interface RowHeadProps {
  readonly glyph: ActivityGlyph;
  readonly title: string;
  readonly hint: string | null;
}

export interface ActivityRowProps extends RowHeadProps {
  readonly reason: string | null;
  readonly rise: boolean;
  readonly toggle?: RowToggle;
  readonly children?: ReactNode;
}

function RowHead({ glyph, title, hint }: RowHeadProps): ReactNode {
  return (
    <>
      <View className="size-4 items-center justify-center rounded-full bg-bg">
        <GlyphMark glyph={glyph} />
      </View>
      <Text variant="footnote" numberOfLines={1} className="max-w-full shrink">
        {title}
      </Text>
      {hint === null || hint === title ? null : (
        <Text variant="footnote" tone="faint" numberOfLines={1} className="min-w-0 flex-1">
          {hint}
        </Text>
      )}
    </>
  );
}

function RowFrame({
  rise,
  children,
}: {
  readonly rise: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return rise ? (
    <Rise from={RISE_PX.step} duration={RISE_MS.step} className="min-w-0">
      {children}
    </Rise>
  ) : (
    <View className="min-w-0">{children}</View>
  );
}

function RowPress({
  head,
  toggle,
}: {
  readonly head: RowHeadProps;
  readonly toggle?: RowToggle;
}): ReactNode {
  const label =
    head.hint === null || head.hint === head.title ? head.title : `${head.title}. ${head.hint}`;
  return toggle === undefined ? (
    <View accessible accessibilityLabel={label} className="min-h-6 flex-row items-center gap-2">
      <RowHead {...head} />
    </View>
  ) : (
    <Interactive
      label={label}
      expanded={toggle.open}
      hint={toggle.hint}
      onPress={toggle.onPress}
      className="min-h-6 flex-row items-center gap-2 rounded-sm"
      layerClassName="-mx-1 rounded-sm"
    >
      <RowHead {...head} />
    </Interactive>
  );
}

export function ActivityRow({
  toggle,
  reason,
  rise,
  children,
  ...head
}: ActivityRowProps): ReactNode {
  return (
    <RowFrame rise={rise}>
      <RowPress head={head} {...(toggle === undefined ? {} : { toggle })} />
      {reason === null ? null : (
        <Text variant="caption" tone="critical" className="-mt-0.5 mb-1 pl-6" selectable>
          {reason}
        </Text>
      )}
      {children === undefined ? null : (
        <View className="mb-1.5 mt-0.5 min-w-0 pl-6">{children}</View>
      )}
    </RowFrame>
  );
}

const STEP_GLYPH: Readonly<Record<StepState, ActivityGlyph>> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
  retried: 'retried',
};

function StepRow({ step }: { readonly step: WorkStep }): ReactNode {
  const failed = step.state === 'failed';
  const detail = step.detail === '' ? null : step.detail;
  return (
    <ActivityRow
      glyph={STEP_GLYPH[step.state]}
      title={step.title}
      hint={failed ? null : detail}
      reason={failed ? detail : null}
      rise={step.state === 'running'}
    />
  );
}

export function WorkStepList({ steps }: { readonly steps: readonly WorkStep[] }): ReactNode {
  return (
    <ActivityRows>
      {steps.map((step) => (
        <StepRow key={step.key} step={step} />
      ))}
    </ActivityRows>
  );
}
