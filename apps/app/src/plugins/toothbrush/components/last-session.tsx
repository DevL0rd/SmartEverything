import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import { dayLabel, dayOfSession, localTime } from '../model/session-model';
import { RecapBody } from './recap-body';

export function LastSession({ view }: { readonly view: BrushStateView }): ReactNode {
  const today = useDayKey();
  const { lastSession } = view;
  if (!view.mine) {
    return null;
  }
  if (lastSession === null) {
    return (
      <Card title="Last brushing" icon="timer">
        <EmptyState
          compact
          icon="toothbrush"
          title="No brushing yet"
          body="Brush once with your phone nearby and the recap shows up here."
        />
      </Card>
    );
  }
  return (
    <Card title="Last brushing" icon="timer">
      <Text variant="footnote" tone="variant" className="pb-2">
        {dayLabel(dayOfSession(lastSession), today)} at {localTime(lastSession)}
      </Text>
      <RecapBody session={lastSession} profile={view.profile} />
    </Card>
  );
}
