import type { ReactNode } from 'react';
import { BottomSheet } from '../../../components/bottom-sheet';
import { DialogFrame } from '../../../components/dialog-frame';
import { useIdiom } from '../../../design/platform';
import { FolderPicker } from './folder-picker';

export interface FolderPickerSheetProps {
  readonly open: boolean;
  readonly deviceId: string;
  readonly mode: 'folder' | 'file';
  readonly start?: string | null;
  readonly onClose: () => void;
  readonly onChoose?: (path: string) => void;
}

export function FolderPickerSheet(props: FolderPickerSheetProps): ReactNode {
  const { onClose, start = null } = props;
  const touch = useIdiom() === 'touch';
  const title = props.mode === 'folder' ? 'Choose folder' : 'Choose file';
  const frame = { open: props.open, onClose, title, label: title, scroll: false };
  const body = (
    <FolderPicker
      deviceId={props.deviceId}
      mode={props.mode}
      start={start}
      compact={touch}
      onCancel={onClose}
      onChoose={(path) => {
        onClose();
        props.onChoose?.(path);
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
