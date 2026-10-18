import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ApiError } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { isNative } from '../../../design/platform';
import { FileTable } from './file-table';
import { parentOf, sourceWord } from './file-model';
import type { Browse } from './use-browse';
import type { FileActions } from './use-file-actions';
import type { Selection } from './use-selection';

function Loading(): ReactNode {
  return (
    <View className="gap-3 p-4" accessibilityLabel="Reading this folder">
      {[0, 1, 2, 3, 4, 5].map((slot) => (
        <Skeleton key={slot} shape="line" className="h-10" />
      ))}
    </View>
  );
}

function EmptyFolder({
  searching,
  onUpload,
}: {
  readonly searching: boolean;
  readonly onUpload: () => void;
}): ReactNode {
  if (searching) {
    return (
      <EmptyState
        icon="search"
        title="Nothing found"
        body="No file in this folder has that name."
      />
    );
  }
  return (
    <EmptyState
      icon="folder"
      title="This folder is empty"
      body="Upload files here or move some in from another folder."
      action={
        <Button
          label={`Upload from ${sourceWord(isNative())}`}
          variant="tonal"
          icon="upload"
          onPress={onUpload}
        />
      }
    />
  );
}

function NoPermission({
  error,
  onUp,
}: {
  readonly error: ApiError;
  readonly onUp: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="lock"
      title="No permission to open this folder"
      body={error.message}
      action={<Button label="Go up" variant="tonal" icon="arrowUp" onPress={onUp} />}
    />
  );
}

function Failed({
  browse,
  error,
}: {
  readonly browse: Browse;
  readonly error: unknown;
}): ReactNode {
  if (error instanceof ApiError && error.code === 'forbidden') {
    return (
      <NoPermission
        error={error}
        onUp={() => {
          browse.go(parentOf(browse.here));
        }}
      />
    );
  }
  return <ErrorState error={error} retry={browse.pages.retry} />;
}

export function Content({
  browse,
  actions,
  selection,
  wide,
  online,
  name,
  onUpload,
}: {
  readonly browse: Browse;
  readonly actions: FileActions;
  readonly selection: Selection;
  readonly wide: boolean;
  readonly online: boolean;
  readonly name: string;
  readonly onUpload: () => void;
}): ReactNode {
  const { pages, entries } = browse;
  if (!online && pages.first === undefined) {
    return (
      <EmptyState icon="wifiOff" title={`${name} is offline`} body="Files come back when it is." />
    );
  }
  if (pages.error !== null && pages.first === undefined) {
    return <Failed browse={browse} error={pages.error} />;
  }
  if (pages.first === undefined) return <Loading />;
  if (entries.length === 0) return <EmptyFolder searching={browse.searching} onUpload={onUpload} />;
  return (
    <FileTable
      entries={entries}
      wide={wide}
      canAttach={actions.canAttach}
      showPath={browse.searching}
      selected={selection.paths}
      selecting={selection.active}
      loadingMore={pages.loadingMore}
      stale={pages.stale}
      onMore={pages.more}
      onAction={actions.onAction}
    />
  );
}
