import type { ReactNode } from 'react';
import type { DriveConflict } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { fileNameOf } from '../model/file-name';
import { sentenceOf } from './conflict-model';
import { useConflictFacts } from './use-conflict-sides';

export interface ConflictRowProps {
  readonly conflict: DriveConflict;
  readonly onOpen: (conflict: DriveConflict) => void;
}

export function ConflictRow({ conflict, onOpen }: ConflictRowProps): ReactNode {
  const { sides } = useConflictFacts(conflict);
  const name = fileNameOf(conflict.relPath);
  const sentence = sentenceOf(sides);
  return (
    <ListRow
      title={name}
      subtitle={sentence}
      wrapSubtitle
      icon="warning"
      iconTone="warning"
      chevron
      label={`${name}: ${sentence}. Choose the copy to keep`}
      onPress={() => {
        onOpen(conflict);
      }}
    />
  );
}
