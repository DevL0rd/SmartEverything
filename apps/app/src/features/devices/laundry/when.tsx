import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { IconButton } from '../../../components/icon-button';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { clock, MINUTE_MS } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { Note } from './parts';
import {
  FINISH_STEP,
  dayWord,
  earliestFinish,
  epochMinute,
  finishError,
  latestFinish,
} from './finish';
import type { DraftHandle } from './use-draft';
import { formatLaundryMinutes } from '@smarteverything/domain';

const WHEN = [
  { value: 'now', label: 'Start now' },
  { value: 'finish', label: 'Finish by' },
] as const;

function FinishText({
  draft,
  finishAt,
  nowMinute,
}: {
  readonly draft: DraftHandle;
  readonly finishAt: number;
  readonly nowMinute: number;
}): ReactNode {
  const error = finishError(finishAt, nowMinute, draft.estimate);
  const text = clock(finishAt * MINUTE_MS);
  if (error !== null) {
    return <Note icon="alert" tone="critical" text={error} />;
  }
  return (
    <Text variant="footnote" tone="variant">
      {draft.estimate === null
        ? `Finishes at ${text}, in ${formatLaundryMinutes(finishAt - nowMinute)}.`
        : `Starts at ${clock((finishAt - draft.estimate) * MINUTE_MS)} and finishes at ${text}.`}
    </Text>
  );
}

function FinishRow({
  draft,
  finishAt,
}: {
  readonly draft: DraftHandle;
  readonly finishAt: number;
}): ReactNode {
  const now = useMinute();
  const nowMinute = epochMinute(now);
  const low = earliestFinish(nowMinute, draft.estimate);
  const high = latestFinish(nowMinute);
  return (
    <View className="gap-2">
      <View className="min-h-touch-min flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body">Finish by</Text>
          <Text variant="footnote" tone="variant">
            {dayWord(finishAt, now)}
          </Text>
        </View>
        <IconButton
          icon="minus"
          label="Earlier by 15 minutes"
          variant="standard"
          disabled={finishAt - FINISH_STEP < low}
          onPress={() => {
            draft.setFinishAt(Math.max(low, finishAt - FINISH_STEP));
          }}
        />
        <Text variant="body-strong" className="min-w-16 tabular" align="center">
          {clock(finishAt * MINUTE_MS)}
        </Text>
        <IconButton
          icon="plus"
          label="Later by 15 minutes"
          variant="standard"
          disabled={finishAt + FINISH_STEP > high}
          onPress={() => {
            draft.setFinishAt(Math.min(high, finishAt + FINISH_STEP));
          }}
        />
      </View>
      <FinishText draft={draft} finishAt={finishAt} nowMinute={nowMinute} />
    </View>
  );
}

export function WhenCard({
  draft,
  disabled,
}: {
  readonly draft: DraftHandle;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <Card title="When">
      <View className="gap-3">
        <Segmented
          label="Start"
          options={WHEN}
          value={draft.finishAt === null ? 'now' : 'finish'}
          disabled={disabled}
          onChange={(value) => {
            if (value === 'finish') {
              draft.enterFinish();
            } else {
              draft.setFinishAt(null);
            }
          }}
        />
        {draft.finishAt === null ? null : <FinishRow draft={draft} finishAt={draft.finishAt} />}
      </View>
    </Card>
  );
}
