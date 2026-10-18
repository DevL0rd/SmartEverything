import type { ReactNode } from 'react';
import { ErrorState } from '../../../components/error-state';
import type { StateLoad } from '../data/computer-state';

export function StateMissing({
  load,
  offline,
  loading,
}: {
  readonly load: StateLoad;
  readonly offline: boolean;
  readonly loading: ReactNode;
}): ReactNode {
  if (offline) return null;
  if (load.error !== null) return <ErrorState error={load.error} retry={load.retry} />;
  return loading;
}
