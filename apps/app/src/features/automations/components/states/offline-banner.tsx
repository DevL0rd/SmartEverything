import type { ReactNode } from 'react';
import { Banner } from '../../../../components/banner';
import { STATES_COPY } from './states-copy';

export interface OfflineBannerProps {
  readonly unsavedChanges: boolean;
  readonly onRetry?: () => void;
}

export function OfflineBanner({ unsavedChanges, onRetry }: OfflineBannerProps): ReactNode {
  const copy = STATES_COPY.offline;
  return (
    <Banner
      tone="warning"
      title={copy.title}
      body={unsavedChanges ? copy.unsaved : copy.paused}
      wrapBody
      {...(onRetry === undefined ? {} : { action: { label: copy.retry, onPress: onRetry } })}
    />
  );
}
