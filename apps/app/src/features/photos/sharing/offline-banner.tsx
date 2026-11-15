import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';

export function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last sync"
      body="Changes are off until your home hub answers again."
      wrapBody
    />
  );
}
