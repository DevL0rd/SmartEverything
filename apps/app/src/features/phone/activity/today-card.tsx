import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { dayKeyOf, startOfDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { doingToday, usePhoneDoing } from '../data/phone-history';
import { DoingTimeline } from './doing-timeline';

export function DoingTodayCard({
  device,
  linked,
}: {
  readonly device: Device;
  readonly linked: boolean;
}): ReactNode {
  const now = useMinute();
  const doing = usePhoneDoing(device.id, now);
  const segments = doing.segments === undefined ? undefined : doingToday(doing.segments, now);
  return (
    <Card
      title="Doing today"
      icon="activity"
      {...(linked ? { href: href.settings.device(device.id, 'activity') } : {})}
    >
      <DoingTimeline segments={segments} from={startOfDayKey(dayKeyOf(now))} to={now} />
    </Card>
  );
}
