import type { ReactNode } from 'react';
import type { ReachSettings } from '@smarteverything/domain';
import { LoadedQuery } from '../../../components/loaded-query';
import { notify } from '../../../components/toast-store';
import { useReachSettings } from './reach-data';

export function ReachLoaded({
  children,
}: {
  readonly children: (settings: ReachSettings) => ReactNode;
}): ReactNode {
  return <LoadedQuery query={useReachSettings()}>{children}</LoadedQuery>;
}

export function unsaved(error: unknown): void {
  notify({ message: 'Your reach settings were not changed', error, tone: 'critical' });
}
