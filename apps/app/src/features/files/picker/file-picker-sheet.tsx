import type { ReactNode } from 'react';
import { BottomSheet } from '../../../components/bottom-sheet';
import { DialogFrame } from '../../../components/dialog-frame';
import { useIdiom } from '../../../design/platform';
import { FilePicker, type FilePickerProps } from './file-picker';
import { pickerTitleOf } from './picker-model';

export type FilePickerSheetProps<O> = Omit<FilePickerProps<O>, 'compact' | 'onCancel'> & {
  readonly open: boolean;
  readonly title?: string;
  readonly onClose: () => void;
};

export function FilePickerSheet<O>(props: FilePickerSheetProps<O>): ReactNode {
  const { open, onClose, onChoose, title = pickerTitleOf(props.mode), ...picker } = props;
  const touch = useIdiom() === 'touch';
  const frame = { open, onClose, title, label: title, scroll: false };
  const body = (
    <FilePicker
      {...picker}
      compact={touch}
      onCancel={onClose}
      onChoose={(choice) => {
        onClose();
        onChoose(choice);
      }}
    />
  );
  if (touch) {
    return (
      <BottomSheet {...frame} detents={['fit']} compact>
        {body}
      </BottomSheet>
    );
  }
  return (
    <DialogFrame {...frame} kind="dialog" wide>
      {body}
    </DialogFrame>
  );
}
