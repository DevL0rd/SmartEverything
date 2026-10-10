import type { ReactNode } from 'react';
import { WATCH_STATE } from '@smarteverything/domain';
import { Banner } from '../../components/banner';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import type { PhoneWatchStatus } from '../../../modules/health-connect';
import type { Device } from '../../store/state';
import { usePhoneWatch, useWatchLink } from './watch-link';
import { PHASE_TEXT, PhoneRows, VendorBanner } from './watch-phone-rows';
import { WatchToday } from './watch-today';
import { WatchWorkoutCard } from './watch-workout-card';

export function isLocalWatch(device: Device): boolean {
  return device.provider === 'local' && device.details['driver'] === 'xiaomi_watch';
}

function HubRows({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const phase = WATCH_STATE.shape.phase.safeParse(device.details['phase']);
  const reportedAt = device.details['reportedAt'];
  return (
    <List title="Connection">
      <ListRow
        title={phase.success ? PHASE_TEXT[phase.data] : 'No phone has connected yet'}
        subtitle={
          typeof reportedAt === 'string'
            ? `Reported ${relative(reportedAt, now)} by its person’s phone`
            : 'Open SmartEverything on its person’s phone'
        }
        icon="bluetooth"
      />
    </List>
  );
}

function LinkProblem(): ReactNode {
  const link = useWatchLink();
  if (link.kind === 'update_needed') {
    return <Banner tone="warning" title="Update the app to use this" body={link.reason} />;
  }
  if (link.kind === 'failed') {
    return <Banner tone="critical" title="This phone can’t reach the watch" body={link.reason} />;
  }
  return null;
}

function Problems({ watch }: { readonly watch: PhoneWatchStatus | null }): ReactNode {
  const error = watch?.error ?? null;
  const syncError = watch?.syncError ?? null;
  return (
    <>
      {error === null ? null : (
        <Banner tone="critical" title="The watch isn’t connected" body={error} />
      )}
      {syncError === null ? null : (
        <Banner tone="warning" title="The last sync didn’t finish" body={syncError} />
      )}
      <LinkProblem />
    </>
  );
}

export function WatchStatus({ device }: { readonly device: Device }): ReactNode {
  const watch = usePhoneWatch(device.id);
  return (
    <>
      <Problems watch={watch} />
      {watch === null ? null : <VendorBanner watch={watch} />}
      <WatchToday />
      <WatchWorkoutCard device={device} />
      {watch === null ? <HubRows device={device} /> : <PhoneRows watch={watch} />}
    </>
  );
}
