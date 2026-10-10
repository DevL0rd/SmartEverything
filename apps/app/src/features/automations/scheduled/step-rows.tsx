import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ScheduleResult, ScheduleRow, ScheduleStep } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Tone } from '../../../components/tone';
import { joinParts } from '../../../format/text';
import { duration, moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { runScheduledNow } from './actions';
import { latestResult, missedResults } from './view';

const STEP_ICON: Readonly<Record<ScheduleStep['kind'], IconName>> = {
  tool: 'sparkles',
  ai: 'sparkles',
  wait: 'timer',
};

function stepTitle(row: ScheduleRow, index: number): string {
  const step = row.steps[index];
  if (step?.kind === 'wait') {
    return `Wait ${duration(step.seconds)}`;
  }
  return row.step_lines[index] ?? (step?.kind === 'ai' ? step.prompt : 'Step');
}

interface ResultLook {
  readonly line: string;
  readonly tone: Tone;
  readonly icon: IconName;
}

function lookOf(result: ScheduleResult | null, now: number, zone: string): ResultLook | null {
  if (result === null) {
    return null;
  }
  const when = moment(result.at, now, zone);
  switch (result.outcome) {
    case 'ok':
      return { line: `Done ${when}`, tone: 'positive', icon: 'check' };
    case 'failed':
      return {
        line: joinParts([`Didn’t work ${when}`, result.detail]),
        tone: 'critical',
        icon: 'alert',
      };
    case 'interrupted':
      return { line: 'Stopped by a restart and not run again', tone: 'warning', icon: 'alert' };
    case 'missed':
      return { line: result.line, tone: 'variant', icon: 'clock' };
  }
}

interface StepView {
  readonly title: string;
  readonly icon: IconName;
  readonly look: ResultLook | null;
  readonly retry: boolean;
}

function stepView(row: ScheduleRow, index: number, now: number, zone: string): StepView {
  const kind = row.steps[index]?.kind ?? 'tool';
  const look = lookOf(latestResult(row, index), now, zone);
  return {
    title: stepTitle(row, index),
    icon: look?.icon ?? STEP_ICON[kind],
    look,
    retry: look !== null && look.tone !== 'positive' && kind !== 'wait' && row.state !== 'running',
  };
}

function StepRow({
  row,
  index,
  zone,
}: {
  readonly row: ScheduleRow;
  readonly index: number;
  readonly zone: string;
}): ReactNode {
  const view = stepView(row, index, useMinute(), zone);
  return (
    <View className="flex-row items-center pr-3">
      <View className="min-w-0 flex-1">
        <ListRow
          title={view.title}
          icon={view.icon}
          iconTone={view.look?.tone ?? 'variant'}
          {...(view.look === null
            ? {}
            : { subtitle: view.look.line, subtitleTone: view.look.tone })}
        />
      </View>
      {view.retry ? (
        <Button
          label="Run now"
          variant="tonal"
          onPress={() => {
            runScheduledNow(row, index);
          }}
        />
      ) : null}
    </View>
  );
}

export function StepRows({
  row,
  zone,
}: {
  readonly row: ScheduleRow;
  readonly zone: string;
}): ReactNode {
  const missed = missedResults(row);
  return (
    <>
      <List title="Steps" inset>
        {row.steps.map((step, index) => (
          <StepRow key={`${String(index)}:${step.kind}`} row={row} index={index} zone={zone} />
        ))}
      </List>
      {missed.length === 0 ? null : (
        <List title="Missed while the server was off" inset>
          {missed.map((result) => (
            <ListRow
              key={result.at}
              title={result.line}
              icon="clock"
              subtitle={result.detail ?? ''}
            />
          ))}
        </List>
      )}
    </>
  );
}
