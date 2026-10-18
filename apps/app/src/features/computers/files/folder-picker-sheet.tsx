import type { ReactNode } from 'react';
import { Sheet } from '../../../components/sheet';
import { FolderPicker, type FolderPickerProps } from './folder-picker';

export interface FolderPickerSheetProps extends Omit<FolderPickerProps, 'mode' | 'onCancel'> {
  readonly open: boolean;
  readonly mode: 'folder' | 'file';
  readonly onClose: () => void;
}

export function FolderPickerSheet({
  open,
  mode,
  onClose,
  onChoose,
  ...picker
}: FolderPickerSheetProps): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'folder' ? 'Choose folder' : 'Choose file'}
      detents={['full']}
      scroll={false}
      wide
    >
      <FolderPicker
        {...picker}
        mode={mode}
        onCancel={onClose}
        onChoose={(path) => {
          onClose();
          onChoose?.(path);
        }}
      />
    </Sheet>
  );
}
