import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { ErrorState } from '../../../components/error-state';
import { FilePicker, FilePickerSheet, type PickerChoice } from '../../files';
import type { ComputerOrigin } from '../source/computer-node';
import { paramOfLocation } from './computer-route';
import { useComputerStart } from './use-computer-start';

export interface ComputerFolderPickerProps {
  readonly deviceId: string;
  readonly start?: string | null;
  readonly writableOnly?: boolean;
  readonly onChoose: (path: string) => void;
  readonly onCancel: () => void;
  readonly compact?: boolean;
}

function choose(onChoose: (path: string) => void): (choice: PickerChoice<ComputerOrigin>) => void {
  return (choice) => {
    if (choice.kind === 'folder') onChoose(paramOfLocation(choice.location));
  };
}

export function ComputerFolderPicker(props: ComputerFolderPickerProps): ReactNode {
  const { source, location, failure } = useComputerStart(props.deviceId, props.start ?? undefined);
  if (failure !== null) return <ErrorState error={failure.error} retry={failure.retry} />;
  if (location === null) return <Skeleton shape="tile" className="h-48" />;
  return (
    <FilePicker
      source={source}
      mode="folder"
      start={location}
      writableOnly={props.writableOnly ?? false}
      compact={props.compact ?? false}
      onCancel={props.onCancel}
      onChoose={choose(props.onChoose)}
    />
  );
}

export interface ComputerFolderPickerSheetProps {
  readonly deviceId: string;
  readonly open: boolean;
  readonly title: string;
  readonly writableOnly?: boolean;
  readonly onChoose: (path: string) => void;
  readonly onClose: () => void;
}

function OpenSheet(props: ComputerFolderPickerSheetProps): ReactNode {
  const { source, location, failure } = useComputerStart(props.deviceId, undefined);
  if (location === null) {
    return (
      <Sheet open onClose={props.onClose} title={props.title} detents={['half']}>
        <View className="pb-4">
          {failure === null ? (
            <Skeleton shape="tile" className="h-48" />
          ) : (
            <ErrorState error={failure.error} retry={failure.retry} />
          )}
        </View>
      </Sheet>
    );
  }
  return (
    <FilePickerSheet
      open
      source={source}
      mode="folder"
      start={location}
      title={props.title}
      writableOnly={props.writableOnly ?? false}
      onClose={props.onClose}
      onChoose={choose(props.onChoose)}
    />
  );
}

export function ComputerFolderPickerSheet(props: ComputerFolderPickerSheetProps): ReactNode {
  return props.open ? <OpenSheet {...props} /> : null;
}
