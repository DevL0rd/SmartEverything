import type { ReactNode } from 'react';
import type { PhoneDetail, PhoneDetailSectionName, PhoneView } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ReasonLine } from '../../../components/reason-line';
import { Skeleton } from '../../../components/skeleton';
import type { Device } from '../../../store/state';
import { usePhoneRun } from '../data/phone-action';
import { usePhoneDetail } from '../data/phone-detail';
import { pageAccessOf } from '../model/page-access';
import { usePhoneView } from './use-phone-view';

export interface GateContext {
  readonly device: Device;
  readonly view: PhoneView;
}

export interface DetailSectionGateProps<Name extends PhoneDetailSectionName> {
  readonly device: Device;
  readonly name: Name;
  readonly noun: string;
  readonly lockedText: string;
  readonly children: (section: NonNullable<PhoneDetail[Name]>, context: GateContext) => ReactNode;
}

function RefreshHint({
  device,
  noun,
}: {
  readonly device: Device;
  readonly noun: string;
}): ReactNode {
  const refresh = usePhoneRun(device);
  return (
    <EmptyState
      icon="smartphone"
      title={`No ${noun.toLowerCase()} reported yet`}
      body={`${device.label} sends this after the screen turns off, or when you ask for a fresh report.`}
      action={
        <Button
          label="Refresh now"
          variant="tonal"
          loading={refresh.isPending}
          disabled={!device.online}
          onPress={() => {
            refresh.mutate({
              action: { type: 'refresh' },
              failure: `${device.label} did not refresh`,
            });
          }}
        />
      }
    />
  );
}

function Loading(): ReactNode {
  return (
    <>
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </>
  );
}

export function DetailSectionGate<Name extends PhoneDetailSectionName>({
  device,
  name,
  noun,
  lockedText,
  children,
}: DetailSectionGateProps<Name>): ReactNode {
  const view = usePhoneView(device);
  const { detail, error, retry } = usePhoneDetail(device.id);
  if (pageAccessOf(view.tier) === 'locked') return <ReasonLine icon="lock" text={lockedText} />;
  if (error !== null && detail === undefined) return <ErrorState error={error} retry={retry} />;
  if (detail === undefined) return <Loading />;
  const section = detail[name];
  if (section === undefined) return <RefreshHint device={device} noun={noun} />;
  return children(section, { device, view });
}
