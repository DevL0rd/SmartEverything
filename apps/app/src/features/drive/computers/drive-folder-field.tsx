import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { FilePickerSheet, type FileLocation } from '../../files';
import { useDriveRootPlaces, useViewerId } from '../data';
import { DRIVE_PLACES, rootOfPlace } from '../source/drive-places';
import { useDriveSource } from '../source/drive-source';
import { pickedFolderOf, type PickedFolder } from './placement-model';

const START: FileLocation = { place: DRIVE_PLACES.myDrive, folder: null };

export function DriveFolderRow({
  picked,
  onChoose,
}: {
  readonly picked: PickedFolder | null;
  readonly onChoose: () => void;
}): ReactNode {
  return (
    <ListRow
      title="Drive folder"
      subtitle={picked?.name ?? 'Choose a folder you can add to'}
      icon="hardDrive"
      trailing={
        <Button label="Choose" spoken="Choose a Drive folder" variant="tonal" onPress={onChoose} />
      }
    />
  );
}

export function DriveFolderPickerSheet({
  open,
  onClose,
  onPick,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (picked: PickedFolder) => void;
}): ReactNode {
  const source = useDriveSource();
  const roots = useDriveRootPlaces();
  const viewerId = useViewerId();
  return (
    <FilePickerSheet
      open={open}
      source={source}
      mode="folder"
      writableOnly
      start={START}
      title="Choose a Drive folder"
      onClose={onClose}
      onChoose={(choice) => {
        const next = pickedFolderOf(
          choice,
          (place) => rootOfPlace(place, roots, viewerId)?.id ?? null,
        );
        if (next !== null) onPick(next);
      }}
    />
  );
}
