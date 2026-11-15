import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveConflict } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import { plural } from '../../../format/text';
import { flattenPages, useDriveConflicts } from '../data';
import { ConflictCompare } from '../conflicts/conflict-compare';
import { openConflictsOf } from '../conflicts/conflict-model';
import { ConflictRow } from '../conflicts/conflict-row';
import { ConflictSheet } from '../conflicts/conflict-sheet';
import { EditBeatsDeleteRow } from '../conflicts/edit-beats-delete';

export function conflictsTitleOf(count: number, more: boolean): string {
  return more ? `${String(count)}+ conflicts` : plural(count, 'conflict');
}

interface Choice {
  readonly open: DriveConflict | null;
  readonly comparing: DriveConflict | null;
}

const CLOSED: Choice = { open: null, comparing: null };

function ShowMore({
  loading,
  onPress,
}: {
  readonly loading: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View className="px-card-pad pb-card-pad">
      <Button
        label="Show more conflicts"
        variant="text"
        icon="chevronDown"
        loading={loading}
        onPress={onPress}
      />
    </View>
  );
}

export const CONFLICTS_UNREAD = 'Conflicts could not be read';

function ConflictsFailed({
  pages,
}: {
  readonly pages: ReturnType<typeof useDriveConflicts>;
}): ReactNode {
  return (
    <Card title="Conflicts" icon="warning" tone="attention">
      <ErrorState
        error={pages.error}
        title={CONFLICTS_UNREAD}
        retry={() => {
          background(pages.refetch(), 'drive.sync.conflicts_refetch_failed');
        }}
      />
    </Card>
  );
}

export function ConflictsCard(): ReactNode {
  const pages = useDriveConflicts(null);
  const conflicts = openConflictsOf(flattenPages(pages.data, (page) => page.items));
  const [choice, setChoice] = useState<Choice>(CLOSED);
  if (pages.isError && conflicts.length === 0) return <ConflictsFailed pages={pages} />;
  if (conflicts.length === 0) return null;
  const close = (): void => {
    setChoice(CLOSED);
  };
  return (
    <Card
      title={conflictsTitleOf(conflicts.length, pages.hasNextPage)}
      icon="warning"
      tone="attention"
      padding="none"
      className="gap-0"
    >
      {conflicts.map((conflict) => (
        <ConflictRow
          key={conflict.id}
          conflict={conflict}
          onOpen={(open) => {
            setChoice({ open, comparing: null });
          }}
        />
      ))}
      <EditBeatsDeleteRow />
      {pages.hasNextPage ? (
        <ShowMore
          loading={pages.isFetchingNextPage}
          onPress={() => {
            background(pages.fetchNextPage(), 'drive.sync.conflicts_page_failed');
          }}
        />
      ) : null}
      <ConflictSheet
        conflict={choice.open}
        onClose={close}
        onCompare={(comparing) => {
          setChoice({ open: null, comparing });
        }}
      />
      {choice.comparing === null ? null : (
        <ConflictCompare conflict={choice.comparing} onClose={close} />
      )}
    </Card>
  );
}
