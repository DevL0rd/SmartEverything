import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { useSecond } from '../../../store/clock';
import { useAssistantStatus } from '../data/assistant-data';
import {
  elapsedText,
  summaryOfSteps,
  type WorkStep,
  type WorkSummary,
  type WorkTone,
} from '../model/work-steps';
import { WORK_COLLAPSE } from './thread-motion';
import { Spinner, WorkStepList } from './work-step-list';

export interface WorkCardProps {
  readonly steps: readonly WorkStep[];
  readonly live: boolean;
  readonly thinking: boolean;
  readonly reasoning: string;
  readonly startedAt: number | null;
  readonly reconnecting: boolean;
  readonly onStop: (() => void) | null;
}

const FRAME: Readonly<Record<WorkTone, string>> = {
  live: 'border border-primary/45',
  done: 'border-hairline border-outline-variant',
  failed: 'border border-critical/40',
};

function Well({ tone }: { readonly tone: WorkTone }): ReactNode {
  if (tone === 'live') {
    return (
      <View className="size-8 items-center justify-center rounded-sm bg-primary-container">
        <Spinner />
      </View>
    );
  }
  const failed = tone === 'failed';
  return (
    <View
      className={cn(
        'size-8 items-center justify-center rounded-sm',
        failed ? 'bg-critical/14' : 'bg-surface-2',
      )}
    >
      <Icon name={failed ? 'alert' : 'wrench'} size={16} tone={failed ? 'critical' : 'variant'} />
    </View>
  );
}

function LiveNote({
  base,
  startedAt,
}: {
  readonly base: string;
  readonly startedAt: number;
}): ReactNode {
  const now = useSecond();
  const clock = elapsedText(now - startedAt);
  return (
    <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
      {base === '' ? clock : `${base} · ${clock}`}
    </Text>
  );
}

function Note({
  summary,
  startedAt,
}: {
  readonly summary: WorkSummary;
  readonly startedAt: number | null;
}): ReactNode {
  if (summary.tone === 'live' && startedAt !== null) {
    return <LiveNote base={summary.note} startedAt={startedAt} />;
  }
  return summary.note === '' ? null : (
    <Text
      variant="footnote"
      tone={summary.tone === 'failed' ? 'critical' : 'variant'}
      numberOfLines={1}
    >
      {summary.note}
    </Text>
  );
}

function Reconnecting(): ReactNode {
  return (
    <View className="mx-3 mb-3 flex-row items-center gap-1.5 self-start rounded-full bg-surface-2 px-2.5 py-0.5">
      <Spinner tone="variant" />
      <Text variant="caption" tone="variant">
        Reconnecting…
      </Text>
    </View>
  );
}

function SummaryText({
  summary,
  startedAt,
}: {
  readonly summary: WorkSummary;
  readonly startedAt: number | null;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <Text
        variant="callout"
        className="font-sans-medium"
        numberOfLines={summary.tone === 'live' ? 2 : 1}
      >
        {summary.title}
      </Text>
      <Note summary={summary} startedAt={startedAt} />
    </View>
  );
}

function SummaryContent({
  summary,
  startedAt,
  open,
  expandable,
}: {
  readonly summary: WorkSummary;
  readonly startedAt: number | null;
  readonly open: boolean;
  readonly expandable: boolean;
}): ReactNode {
  return (
    <>
      <Well tone={summary.tone} />
      <SummaryText summary={summary} startedAt={startedAt} />
      {expandable ? (
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} tone="variant" />
      ) : null}
    </>
  );
}

const SUMMARY_CLASS = 'min-h-14 min-w-0 flex-1 flex-row items-center gap-3 px-3 py-2';

function SummaryArea({
  summary,
  startedAt,
  open,
  expandable,
  onToggle,
}: {
  readonly summary: WorkSummary;
  readonly startedAt: number | null;
  readonly open: boolean;
  readonly expandable: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const label = `${summary.title}. ${summary.note}`;
  const content = (
    <SummaryContent summary={summary} startedAt={startedAt} open={open} expandable={expandable} />
  );
  return expandable ? (
    <Interactive
      label={label}
      hint={open ? 'Hide steps' : 'Show steps'}
      onPress={onToggle}
      className={SUMMARY_CLASS}
      layerClassName="rounded-lg"
    >
      {content}
    </Interactive>
  ) : (
    <View accessible accessibilityLabel={label} className={SUMMARY_CLASS}>
      {content}
    </View>
  );
}

function SummaryRow({
  onStop,
  ...area
}: {
  readonly summary: WorkSummary;
  readonly startedAt: number | null;
  readonly open: boolean;
  readonly expandable: boolean;
  readonly onToggle: () => void;
  readonly onStop: (() => void) | null;
}): ReactNode {
  return (
    <View className="flex-row items-center">
      <SummaryArea {...area} />
      {onStop === null ? null : (
        <View className="pr-2">
          <Button
            label="Stop"
            icon="square"
            variant="tonal"
            onPress={onStop}
            hint="Stop answering"
          />
        </View>
      )}
    </View>
  );
}

function useShowSteps(): boolean {
  return useAssistantStatus()?.settings.activity_steps !== false;
}

export function WorkCard(props: WorkCardProps): ReactNode {
  const { steps, live, thinking, reasoning, startedAt, reconnecting, onStop } = props;
  const motion = useMotion();
  const [open, setOpen] = useState(false);
  const shown = useShowSteps();
  if (!live && !(shown && steps.length > 0)) {
    return null;
  }
  const summary = summaryOfSteps(steps, live, thinking);
  const expandable = shown && (steps.length > 0 || reasoning !== '');
  return (
    <Animated.View
      {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })}
      className={cn('overflow-hidden rounded-lg bg-surface-1 elevation-1', FRAME[summary.tone])}
    >
      <SummaryRow
        summary={summary}
        startedAt={startedAt}
        open={open}
        expandable={expandable}
        onToggle={() => {
          setOpen(!open);
        }}
        onStop={onStop}
      />
      {open && expandable ? (
        <WorkStepList steps={steps} reasoning={reasoning} thinking={thinking} />
      ) : null}
      {reconnecting ? <Reconnecting /> : null}
    </Animated.View>
  );
}
