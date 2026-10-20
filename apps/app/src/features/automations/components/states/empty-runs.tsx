import type { ReactNode } from 'react';
import { EmptyState } from '../../../../components/empty-state';
import { Button } from '../../../../components/button';
import { STATES_COPY } from './states-copy';

export interface EmptyRunsProps {
  readonly onTest?: () => void;
  readonly compact?: boolean;
}

export function EmptyRuns({ onTest, compact = true }: EmptyRunsProps): ReactNode {
  const copy = STATES_COPY.emptyRuns;
  return (
    <EmptyState
      icon="activity"
      title={copy.title}
      body={copy.body}
      compact={compact}
      {...(onTest === undefined
        ? {}
        : { action: <Button label={copy.test} icon="play" variant="tonal" onPress={onTest} /> })}
    />
  );
}
