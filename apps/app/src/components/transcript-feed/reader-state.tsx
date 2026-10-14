import type { ReactNode } from 'react';
import { ApiError } from '@smarteverything/domain';
import { EmptyState } from '../empty-state';
import { ErrorState } from '../error-state';
import { Skeleton } from '../skeleton';

export interface ReaderStateProps {
  readonly error: unknown;
  readonly loading: boolean;
  readonly empty: boolean;
  readonly missingAnchor: boolean;
  readonly words: string;
  readonly retry: () => void;
}

export function ReaderState(props: ReaderStateProps): ReactNode {
  if (props.error instanceof ApiError && props.error.status === 404) {
    return (
      <EmptyState
        icon="fileText"
        title="Transcripts unavailable"
        body="Update your server to read and search transcripts here."
      />
    );
  }
  if (props.error !== null) return <ErrorState error={props.error} retry={props.retry} />;
  if (props.loading) return <Skeleton shape="block" className="h-40" />;
  if (props.missingAnchor)
    return (
      <EmptyState
        icon="fileText"
        title="This line is no longer available"
        body="It may have expired or been deleted. Return to the results or latest speech."
      />
    );
  if (!props.empty) return null;
  return (
    <EmptyState
      icon={props.words === '' ? 'fileText' : 'search'}
      title={props.words === '' ? 'No transcripts yet' : 'Nothing found'}
      body={
        props.words === ''
          ? 'Speech appears here when transcription is turned on.'
          : `No line mentions “${props.words}”.`
      }
    />
  );
}
