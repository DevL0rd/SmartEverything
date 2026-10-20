import { bottleFaultName } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';
import { href } from '../../../app-shell/hrefs';

export function FaultCard({
  deviceId,
  fault,
}: {
  readonly deviceId: string;
  readonly fault: string | null;
}): ReactNode {
  if (fault === null) {
    return null;
  }
  return (
    <Banner
      tone="critical"
      title={bottleFaultName(fault)}
      body="Cleaning is off until the cap reports no fault. The raw code is in Care."
      wrapBody
      action={{ label: 'Open Care', href: href.deviceSection(deviceId, 'care') }}
    />
  );
}
