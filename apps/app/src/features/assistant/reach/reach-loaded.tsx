import type { ReactNode } from 'react';
import type { ReachSettings } from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { notify } from '../../../components/toast-store';
import { useReachSettings } from './reach-data';

export function ReachLoaded({
  children,
}: {
  readonly children: (settings: ReachSettings) => ReactNode;
}): ReactNode {
  const settings = useReachSettings();
  if (settings.isError) {
    return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  }
  if (settings.data === undefined) {
    return <Skeleton shape="line" className="h-12" />;
  }
  return children(settings.data);
}

export function unsaved(error: unknown): void {
  notify({ message: 'Your reach settings were not changed', error, tone: 'critical' });
}
