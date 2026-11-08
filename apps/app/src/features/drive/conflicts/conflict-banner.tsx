import type { ReactNode } from 'react';
import type { DriveConflict } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { useIdiom } from '../../../design/platform';
import { ConflictActions } from './conflict-actions';
import { BANNER_NOTE, sentenceOf } from './conflict-model';
import { useConflictFacts } from './use-conflict-sides';

export interface ConflictBannerProps {
  readonly conflict: DriveConflict;
  readonly onResolved?: () => void;
}

export function ConflictBanner({ conflict, onResolved }: ConflictBannerProps): ReactNode {
  const { sides } = useConflictFacts(conflict);
  const pointer = useIdiom() === 'pointer';
  return (
    <Banner tone="warning" title={sentenceOf(sides)} body={BANNER_NOTE} wrapBody>
      <ConflictActions
        conflict={conflict}
        sides={sides}
        pointer={pointer}
        {...(onResolved === undefined ? {} : { onResolved })}
      />
    </Banner>
  );
}
